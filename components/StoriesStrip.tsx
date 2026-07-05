"use client";

import { useState, useEffect, useRef } from "react";
import { collection, query, orderBy, limit, onSnapshot, doc, getDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
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
}

interface UserStories {
  authorId: string;
  authorName: string;
  authorPhoto: string;
  stories: Story[];
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
  }, [activeGroup, activeIdx]);

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
            <div className="absolute top-0 left-0 right-0 z-10 flex gap-1 p-3">
              {activeGroup.stories.map((_, i) => (
                <div key={i} className="flex-1 h-0.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.3)" }}>
                  <div className="h-full rounded-full" style={{ background: "#fff", width: i < activeIdx ? "100%" : i === activeIdx ? `${progress}%` : "0%", transition: i === activeIdx ? "none" : undefined }} />
                </div>
              ))}
            </div>
            <div className="absolute top-8 left-0 right-0 z-10 flex items-center gap-3 px-4 py-2">
              {current.authorPhoto ? (
                <img src={current.authorPhoto} alt="" width={36} height={36} className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold" style={{ background: "#333", color: "#aaa" }}>
                  {current.authorName?.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="font-semibold text-white text-sm">{current.authorName}</span>
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
            <div className="flex-1 flex items-center justify-center">
              {isVideo(current) ? (
                <video key={current.id} src={current.mediaUrl} autoPlay playsInline muted className="w-full h-full object-contain" style={{ maxHeight: "100vh" }} />
              ) : current.mediaUrl ? (
                <img key={current.id} src={current.mediaUrl} alt="Story" className="w-full h-full object-contain" style={{ maxHeight: "100vh" }} />
              ) : (
                <div className="text-white text-lg font-semibold px-8 text-center">{current.authorName}</div>
              )}
            </div>
            <button onClick={goPrev} className="absolute left-0 top-0 bottom-0 w-1/3 border-none bg-transparent cursor-pointer" aria-label="Previous" />
            <button onClick={goNext} className="absolute right-0 top-0 bottom-0 w-1/3 border-none bg-transparent cursor-pointer" aria-label="Next" />
          </div>
        </div>
      )}
    </>
  );
}
