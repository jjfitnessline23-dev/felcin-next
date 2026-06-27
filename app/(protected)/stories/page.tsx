"use client";

import { useState, useEffect, useRef } from "react";
import { collection, query, orderBy, limit, onSnapshot, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";

interface Story {
  id: string; authorId: string; authorName?: string; authorPhoto?: string;
  mediaUrl?: string; contentType?: string; mimeType?: string; expiresAt?: { seconds: number }; createdAt?: { seconds: number };
}
interface UserStories { authorId: string; authorName: string; authorPhoto: string; stories: Story[]; }

function isVideo(s: Story) {
  const t = s.contentType || s.mimeType || "";
  if (t === "video" || t.startsWith("video/")) return true;
  return /\.(mp4|webm|mov|avi|3gp)(\?|$)/i.test(s.mediaUrl || "");
}

const STORY_DURATION = 5000;
const REACTIONS = ["❤️", "🔥", "💪", "😮", "😂"];

export default function StoriesPage() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<UserStories[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGroup, setActiveGroup] = useState<UserStories | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [myReaction, setMyReaction] = useState<string | null>(null);
  const [reactionAnim, setReactionAnim] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(200));
    return onSnapshot(q, async (snap) => {
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
      await Promise.all(uidSet.map(async (uid) => {
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
      }));

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
      setLoading(false);
    }, () => setLoading(false));
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

  async function reactToStory(emoji: string) {
    if (!user || !current) return;
    setMyReaction(emoji);
    setReactionAnim(emoji);
    setTimeout(() => setReactionAnim(null), 900);
    await setDoc(doc(db, "posts", current.id, "reactions", user.uid), {
      emoji, reactedAt: serverTimestamp(),
    }).catch(() => {});
  }

  const openGroup = (g: UserStories) => { setActiveGroup(g); setActiveIdx(0); setMyReaction(null); };
  const closeViewer = () => {
    setActiveGroup(null); setActiveIdx(0);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (progressRef.current) clearInterval(progressRef.current);
  };
  const goNext = () => { if (!activeGroup) return; if (activeIdx < activeGroup.stories.length - 1) setActiveIdx((i) => i + 1); else closeViewer(); };
  const goPrev = () => { if (activeIdx > 0) setActiveIdx((i) => i - 1); };
  const current = activeGroup?.stories[activeIdx];

  return (
    <div className="max-w-2xl mx-auto pb-6">
      <PageHeader title="Stories" right={
        <Link href="/creator?mode=story"
          className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold"
          style={{ background: "#fff", color: "#000" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>add</span>
          Add
        </Link>
      } />

      {/* Cinematic Hero */}
      <div className="relative mx-4 mt-2 mb-4 rounded-3xl overflow-hidden"
        style={{ background: "linear-gradient(135deg,#130008 0%,#1c0012 50%,#130008 100%)", border: "1px solid rgba(236,72,153,0.2)", minHeight: 160 }}>
        <div className="absolute left-0 w-full pointer-events-none" style={{ height: 1.5, background: "linear-gradient(90deg,transparent,rgba(236,72,153,0.4),transparent)", animation: "scanLine 5s linear infinite", zIndex: 1 }} />
        <div className="absolute pointer-events-none" style={{ top: "-30%", left: "50%", transform: "translateX(-50%)", width: 400, height: 400, background: "radial-gradient(ellipse at center,rgba(236,72,153,0.25) 0%,transparent 65%)", animation: "heroGlow 4s ease-in-out infinite" }} />
        <div className="absolute inset-0 flex items-center justify-end pr-4 pointer-events-none select-none">
          <img src="/static/logo-nav.svg" alt="" style={{ width: 160, opacity: 0.05, filter: "grayscale(1) brightness(3) sepia(1) hue-rotate(280deg)", animation: "floatLogo 8s ease-in-out infinite" }} />
        </div>
        <div className="relative z-10 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(236,72,153,0.2)", border: "1px solid rgba(236,72,153,0.4)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#ec4899", fontVariationSettings: "'FILL' 1" }}>auto_stories</span>
            </div>
            <span className="text-xs font-black tracking-widest" style={{ color: "#ec4899", letterSpacing: "0.18em" }}>STORIES</span>
          </div>
          <h1 className="font-black mb-1" style={{ fontSize: "clamp(1.6rem,6vw,2.2rem)", letterSpacing: -1, background: "linear-gradient(135deg,#fff 0%,#f9a8d4 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Stories</h1>
          <p className="text-sm" style={{ color: "#555" }}>Moments that disappear after 24 hours</p>
          {!loading && (
            <div className="flex items-center gap-4 mt-3">
              <div><span className="text-base font-black" style={{ color: "#ec4899" }}>{groups.length}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>creators live</span></div>
              <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.07)" }} />
              <div><span className="text-base font-black" style={{ color: "#ec4899" }}>{groups.reduce((s, g) => s + g.stories.length, 0)}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>stories</span></div>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-4">

      {loading ? (
        <div className="flex justify-center py-20"><div className="spinner" /></div>
      ) : groups.length === 0 ? (
        <div className="ghost-bg text-center py-20 rounded-3xl">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: "rgba(255,255,255,0.04)", border: "2px dashed rgba(255,255,255,0.1)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 34, color: "#333" }}>auto_stories</span>
          </div>
          <p className="font-semibold mb-2" style={{ color: "#f2f2f2" }}>No stories right now</p>
          <p className="text-sm mb-6" style={{ color: "#555" }}>Stories vanish after 24 hours.</p>
          <Link href="/creator?mode=story"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white"
            style={{ background: "#fff", color: "#000" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 17 }}>add</span>
            Share your story
          </Link>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
          {groups.map((g) => (
            <button key={g.authorId} onClick={() => openGroup(g)}
              className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer bg-transparent border-none">
              <div className="rounded-full p-0.5" style={{ background: "rgba(255,255,255,0.15)", width: 66, height: 66 }}>
                {g.authorPhoto ? (
                  <img src={g.authorPhoto} alt="" className="w-full h-full rounded-full object-cover" style={{ border: "2.5px solid #090909" }} />
                ) : (
                  <div className="w-full h-full rounded-full flex items-center justify-center font-bold"
                    style={{ background: "#1a1a1a", color: "#aaa", border: "2.5px solid #090909" }}>
                    {g.authorName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <span className="text-xs max-w-[64px] truncate" style={{ color: "#888" }}>{g.authorName}</span>
              {g.stories.length > 1 && (
                <span className="text-xs font-semibold" style={{ color: "#fff", marginTop: -4 }}>{g.stories.length}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Story viewer */}
      {activeGroup && current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "#000" }}>
          <style>{`@keyframes reactionPop { 0%{opacity:0;transform:scale(0.5)} 30%{opacity:1;transform:scale(1.3)} 70%{opacity:1;transform:scale(1.1)} 100%{opacity:0;transform:scale(1.5)} }`}</style>
          <div className="relative w-full h-full max-w-sm mx-auto flex flex-col">
            {/* Progress bars */}
            <div className="absolute top-0 left-0 right-0 z-10 flex gap-1 p-3 pt-4">
              {activeGroup.stories.map((_, i) => (
                <div key={i} className="flex-1 h-0.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.25)" }}>
                  <div className="h-full rounded-full" style={{
                    background: "#fff",
                    width: i < activeIdx ? "100%" : i === activeIdx ? `${progress}%` : "0%",
                    transition: i === activeIdx ? "none" : undefined,
                  }} />
                </div>
              ))}
            </div>

            {/* Header */}
            <div className="absolute top-8 left-0 right-0 z-10 flex items-center gap-3 px-4 py-2">
              {current.authorPhoto ? (
                <img src={current.authorPhoto} alt="" className="rounded-full object-cover" style={{ width: 36, height: 36 }} />
              ) : (
                <div className="rounded-full flex items-center justify-center font-bold"
                  style={{ width: 36, height: 36, background: "#222", color: "#aaa" }}>
                  {current.authorName?.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="font-semibold text-white text-sm">{current.authorName}</span>
              <button onClick={closeViewer}
                className="ml-auto w-8 h-8 flex items-center justify-center rounded-full border-none cursor-pointer"
                style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 19 }}>close</span>
              </button>
            </div>

            {/* Media */}
            <div className="flex-1 flex items-center justify-center">
              {isVideo(current) ? (
                <video key={current.id} src={current.mediaUrl} autoPlay playsInline muted className="w-full h-full object-contain" style={{ maxHeight: "100vh" }} />
              ) : current.mediaUrl ? (
                <img key={current.id} src={current.mediaUrl} alt="" className="w-full h-full object-contain" style={{ maxHeight: "100vh" }} />
              ) : (
                <div className="text-white text-lg font-semibold px-8 text-center">{current.authorName}</div>
              )}
            </div>

            {/* Reaction animation */}
            {reactionAnim && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
                style={{ fontSize: 72, animation: "reactionPop 0.9s ease-out forwards" }}>
                {reactionAnim}
              </div>
            )}

            {/* Reaction bar */}
            <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-3 z-10 px-4">
              {REACTIONS.map((emoji) => (
                <button key={emoji} onClick={(e) => { e.stopPropagation(); reactToStory(emoji); }}
                  className="flex items-center justify-center border-none cursor-pointer rounded-full"
                  style={{
                    fontSize: 28, width: 48, height: 48, lineHeight: 1,
                    background: myReaction === emoji ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.4)",
                    transform: myReaction === emoji ? "scale(1.2)" : "scale(1)",
                    transition: "transform 0.15s, background 0.15s",
                  }}>
                  {emoji}
                </button>
              ))}
            </div>

            {/* Tap zones */}
            <button onClick={goPrev} className="absolute left-0 top-0 w-1/3 border-none bg-transparent cursor-pointer" style={{ bottom: 80 }} aria-label="Previous" />
            <button onClick={goNext} className="absolute right-0 top-0 w-1/3 border-none bg-transparent cursor-pointer" style={{ bottom: 80 }} aria-label="Next" />
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
