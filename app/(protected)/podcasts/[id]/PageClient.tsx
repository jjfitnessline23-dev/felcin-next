"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import {
  doc, getDoc, updateDoc, increment, collection, addDoc,
  query, orderBy, onSnapshot, arrayUnion, arrayRemove, serverTimestamp,
} from "@/lib/db";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { sendNotification } from "@/lib/notify";
import Link from "next/link";

interface Episode {
  id: string;
  title: string;
  description?: string;
  audioUrl: string;
  coverUrl?: string;
  hostId?: string;
  hostName: string;
  hostPhoto?: string;
  duration?: number;
  publishedAt?: { seconds: number };
  plays?: number;
  likes?: number;
  likedBy?: string[];
}

interface Comment {
  id: string; authorId: string; authorName: string; authorPhoto?: string;
  text: string; createdAt?: { seconds: number };
}

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function EpisodePage() {
  const params = useParams();
  const epId = params.id as string;

  const [episode, setEpisode] = useState<Episode | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playRecorded, setPlayRecorded] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const { user } = useAuth();
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hostProfile, setHostProfile] = useState<{ name: string; photo: string } | null>(null);

  useEffect(() => {
    getDoc(doc(db, "podcasts", epId)).then((snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...(snap.data() as Omit<Episode, "id">) };
        setEpisode(data);
        setLikeCount(typeof data.likes === "number" ? data.likes : 0);
        // Always show the host's CURRENT profile name/photo (the one they set up),
        // not whatever was captured from their login when the episode was uploaded.
        if (data.hostId) {
          getDoc(doc(db, "users", data.hostId, "public", "profile")).then((p) => {
            if (p.exists()) {
              const d = p.data();
              setHostProfile({ name: d.displayName || d.username || data.hostName, photo: d.photoURL || data.hostPhoto || "" });
            }
          }).catch(() => {});
        }
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [epId]);

  // Reflect whether the current user has liked this episode. Keyed on ids (not the
  // episode/user OBJECTS) so a re-fetch / auth-token refresh doesn't revert a fresh like.
  useEffect(() => {
    if (user && episode) setLiked(Array.isArray(episode.likedBy) && episode.likedBy.includes(user.uid));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, episode?.id]);

  // Live comments
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "podcasts", epId, "comments"), orderBy("createdAt", "desc")),
      (snap) => setComments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Comment, "id">) }))),
      () => {}
    );
    return () => unsub();
  }, [epId]);

  // Notify the podcast host (in-app doc + push), mirroring posts/reels. No-op for self.
  function notifyHost(type: "like" | "comment") {
    if (!user || !episode?.hostId || episode.hostId === user.uid) return;
    addDoc(collection(db, "notifications"), {
      recipientId: episode.hostId, senderId: user.uid,
      senderName: user.displayName || "Someone", senderPhoto: user.photoURL || "",
      type, postId: epId, read: false, createdAt: serverTimestamp(),
    }).catch(() => {});
    sendNotification({ recipientUid: episode.hostId, type, senderName: user.displayName || "Someone", senderId: user.uid, postId: epId });
  }

  async function toggleLike() {
    if (!user || !episode) return;
    const next = !liked;
    setLiked(next); setLikeCount((c) => Math.max(0, c + (next ? 1 : -1)));
    updateDoc(doc(db, "podcasts", epId), {
      likes: increment(next ? 1 : -1),
      likedBy: next ? arrayUnion(user.uid) : arrayRemove(user.uid),
    }).catch(() => { setLiked(!next); setLikeCount((c) => Math.max(0, c + (next ? -1 : 1))); });
    if (next) notifyHost("like");
  }

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : `https://felcin.com/podcasts/${epId}`;
    const title = episode?.title || "Felcin Podcast";
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title, text: `Listen to "${title}" on Felcin`, url });
        return;
      }
    } catch { return; }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }

  async function postComment() {
    if (!user || !commentText.trim() || posting) return;
    setPosting(true);
    try {
      await addDoc(collection(db, "podcasts", epId, "comments"), {
        authorId: user.uid,
        authorName: user.displayName || user.email?.split("@")[0] || "User",
        authorPhoto: user.photoURL || null,
        text: commentText.trim(),
        createdAt: serverTimestamp(),
      });
      setCommentText("");
      notifyHost("comment");
    } catch {}
    setPosting(false);
  }

  // Lock-screen / control-center media controls (MediaSession) — shows title,
  // artwork, play/pause and skip on the lock screen so the podcast can be
  // controlled while the app is backgrounded.
  useEffect(() => {
    if (!episode || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    try {
      ms.metadata = new MediaMetadata({
        title: episode.title || "Felcin Podcast",
        artist: hostProfile?.name || episode.hostName || "Felcin",
        album: "Felcin Podcasts",
        artwork: [{ src: episode.coverUrl || "/logo512.png", sizes: "512x512", type: "image/png" }],
      });
    } catch {}
    const a = () => audioRef.current;
    ms.setActionHandler("play", () => { a()?.play(); });
    ms.setActionHandler("pause", () => { a()?.pause(); });
    ms.setActionHandler("seekbackward", () => { const el = a(); if (el) el.currentTime = Math.max(0, el.currentTime - 15); });
    ms.setActionHandler("seekforward", () => { const el = a(); if (el) el.currentTime = Math.min(el.duration || 0, el.currentTime + 30); });
    try { ms.setActionHandler("seekto", (d) => { const el = a(); if (el && d.seekTime != null) el.currentTime = d.seekTime; }); } catch {}
    return () => {
      (["play", "pause", "seekbackward", "seekforward", "seekto"] as MediaSessionAction[])
        .forEach((act) => { try { ms.setActionHandler(act, null); } catch {} });
    };
  }, [episode]);

  // Keep the lock-screen play/pause state in sync with the player.
  useEffect(() => {
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    }
  }, [playing]);

  // Stop the native background-audio service if the user leaves the episode page.
  useEffect(() => () => { nativeAudio("stop"); }, []);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
      if (!playRecorded) {
        setPlayRecorded(true);
        updateDoc(doc(db, "podcasts", epId), { plays: increment(1) }).catch(() => {});
      }
    }
  }

  // Tell the native Android shell to start/stop a foreground service so audio
  // keeps playing when the app is backgrounded. No-op on web / iOS.
  function nativeAudio(action: "start" | "stop") {
    try {
      const bridge = (window as unknown as { FelcinNativeAudio?: { startPlayback?: () => void; stopPlayback?: () => void } }).FelcinNativeAudio;
      if (action === "start") bridge?.startPlayback?.();
      else bridge?.stopPlayback?.();
    } catch {}
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * duration;
  }

  function skip(secs: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(duration, audio.currentTime + secs));
  }

  if (loading) return <div className="flex justify-center py-32"><div className="spinner" /></div>;
  if (!episode) return (
    <div className="flex flex-col items-center justify-center py-32 px-4">
      <p className="text-lg font-semibold mb-3" style={{ color: "#f2f2f2" }}>Episode not found</p>
      <Link href="/podcasts" className="text-sm" style={{ color: "#888" }}>← Back to Podcasts</Link>
    </div>
  );

  const progress = duration ? (currentTime / duration) * 100 : 0;
  // Prefer the host's live profile name/photo (what they set up) over the value
  // captured at upload time.
  const hostName = hostProfile?.name || episode.hostName;
  const hostPhoto = hostProfile?.photo || episode.hostPhoto;
  const init = (hostName || "H").charAt(0).toUpperCase();

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <Link href="/podcasts" className="inline-flex items-center gap-1 text-sm mb-6" style={{ color: "#888" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
        Podcasts
      </Link>

      {/* Cover art */}
      <style>{`
        @keyframes podGlow  { 0%,100%{opacity:.5}  50%{opacity:.95} }
        @keyframes podFloat { 0%,100%{transform:translateY(0) rotate(-1deg)} 50%{transform:translateY(-8px) rotate(1deg)} }
        @keyframes podScan  { 0%{top:-8%} 100%{top:108%} }
        @keyframes podBarA  { 0%,100%{height:25%} 50%{height:95%} }
        @keyframes podBarB  { 0%,100%{height:70%} 50%{height:30%} }
        @keyframes podBarC  { 0%,100%{height:45%} 50%{height:85%} }
        @keyframes podBarD  { 0%,100%{height:90%} 50%{height:35%} }
      `}</style>
      <div className="relative w-full rounded-3xl overflow-hidden flex items-center justify-center mb-8 mx-auto"
        style={{ aspectRatio: "1/1", maxWidth: 280,
          background: episode.coverUrl ? "#1a1a1a" : "linear-gradient(135deg,#0c0618 0%,#140a26 50%,#0c0618 100%)",
          border: `1px solid ${episode.coverUrl ? "rgba(255,255,255,0.08)" : "rgba(124,58,237,0.3)"}`,
          boxShadow: episode.coverUrl ? "none" : "0 0 60px rgba(124,58,237,0.18)" }}>
        {episode.coverUrl ? (
          <img src={episode.coverUrl} alt="" className="w-full h-full object-cover rounded-3xl" />
        ) : (
          <>
            {/* purple glow */}
            <div className="absolute pointer-events-none" style={{ top: "-25%", left: "50%", transform: "translateX(-50%)", width: "90%", height: "90%", background: "radial-gradient(circle, rgba(124,58,237,0.4) 0%, transparent 62%)", filter: "blur(24px)", animation: "podGlow 5s ease-in-out infinite" }} />
            {/* scan line */}
            <div className="absolute left-0 w-full pointer-events-none" style={{ height: 2, background: "linear-gradient(90deg,transparent,rgba(167,139,250,0.5),transparent)", animation: "podScan 6s linear infinite" }} />
            {/* Felcin logo */}
            <img src="/static/logo-nav.svg" alt="Felcin" className="relative z-10"
              style={{ width: "46%", filter: "drop-shadow(0 0 26px rgba(124,58,237,0.6))", animation: "podFloat 8s ease-in-out infinite" }} />
            {/* animated waveform */}
            <div className="absolute flex items-end gap-[3px] pointer-events-none z-10" style={{ bottom: "15%", height: 24 }}>
              {["A", "B", "C", "D", "A", "C", "B", "D", "A"].map((k, i) => (
                <div key={i} style={{ width: 3, height: "50%", borderRadius: 2, background: "linear-gradient(180deg,#a78bfa,#7C3AED)", animation: `podBar${k} ${1.1 + (i % 3) * 0.25}s ease-in-out infinite` }} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Title & host */}
      <div className="mb-6">
        <h1 className="text-xl font-bold mb-2" style={{ color: "#f2f2f2" }}>{episode.title}</h1>
        <div className="flex items-center gap-2">
          {hostPhoto ? (
            <img src={hostPhoto} alt="" className="rounded-full object-cover" style={{ width: 22, height: 22 }} />
          ) : (
            <div className="rounded-full flex items-center justify-center text-xs font-bold"
              style={{ width: 22, height: 22, background: "#222", color: "#aaa" }}>{init}</div>
          )}
          {episode.hostId ? (
            <Link href={`/user-profile?uid=${episode.hostId}`} className="text-sm no-underline" style={{ color: "#aaa" }}>{hostName}</Link>
          ) : (
            <span className="text-sm" style={{ color: "#888" }}>{hostName}</span>
          )}
          {episode.plays !== undefined && (
            <span className="text-xs" style={{ color: "#444" }}>· {episode.plays} plays</span>
          )}
        </div>
        {episode.description && (
          <p className="text-sm mt-3 leading-relaxed" style={{ color: "#666" }}>{episode.description}</p>
        )}
      </div>

      {/* Player */}
      <div className="rounded-2xl p-5" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
        {/* Progress bar */}
        <div className="mb-4 cursor-pointer" onClick={seek}>
          <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: "rgba(255,255,255,0.08)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: "#f2f2f2" }} />
          </div>
          <div className="flex justify-between text-xs mt-1.5" style={{ color: "#555" }}>
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-6">
          <button onClick={() => skip(-15)}
            className="flex flex-col items-center gap-0.5 border-none bg-transparent cursor-pointer">
            <span className="material-symbols-outlined" style={{ fontSize: 32, color: "#888" }}>replay_10</span>
          </button>
          <button onClick={togglePlay}
            className="w-16 h-16 rounded-full flex items-center justify-center border-none cursor-pointer"
            style={{ background: "#f2f2f2" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 32, color: "#000", fontVariationSettings: "'FILL' 1" }}>
              {playing ? "pause" : "play_arrow"}
            </span>
          </button>
          <button onClick={() => skip(15)}
            className="flex flex-col items-center gap-0.5 border-none bg-transparent cursor-pointer">
            <span className="material-symbols-outlined" style={{ fontSize: 32, color: "#888" }}>forward_10</span>
          </button>
        </div>
      </div>

      {/* Engagement — like / comment / share */}
      <div className="flex items-center gap-7 mt-5">
        <button onClick={toggleLike} aria-label="Like"
          className="flex items-center gap-1.5 border-none bg-transparent cursor-pointer p-0"
          style={{ color: liked ? "#ef4444" : "#888" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 25, fontVariationSettings: liked ? "'FILL' 1" : "'FILL' 0" }}>favorite</span>
          {likeCount > 0 && <span className="text-sm font-semibold">{likeCount}</span>}
        </button>
        <div className="flex items-center gap-1.5" style={{ color: "#888" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 25 }}>mode_comment</span>
          {comments.length > 0 && <span className="text-sm font-semibold">{comments.length}</span>}
        </div>
        <button onClick={share} aria-label="Share"
          className="flex items-center gap-1.5 border-none bg-transparent cursor-pointer p-0 ml-auto"
          style={{ color: copied ? "#34d399" : "#888" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 24 }}>{copied ? "check_circle" : "share"}</span>
          {copied && <span className="text-xs font-semibold">Link copied</span>}
        </button>
      </div>

      {/* Comments */}
      <div className="mt-7">
        <p className="text-sm font-bold mb-3" style={{ color: "#f2f2f2" }}>
          Comments {comments.length > 0 && <span style={{ color: "#555" }}>({comments.length})</span>}
        </p>
        <div className="flex items-center gap-2 mb-5">
          <input value={commentText} onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") postComment(); }}
            placeholder="Add a comment…"
            className="flex-1 rounded-full px-4 py-2.5 text-sm outline-none"
            style={{ background: "#131313", color: "#f2f2f2", border: "1px solid rgba(255,255,255,0.08)" }} />
          <button onClick={postComment} disabled={!commentText.trim() || posting}
            className="px-4 py-2.5 rounded-full text-sm font-bold border-none cursor-pointer"
            style={{ background: (!commentText.trim() || posting) ? "rgba(255,255,255,0.06)" : "#f2f2f2", color: (!commentText.trim() || posting) ? "#444" : "#000" }}>
            {posting ? "…" : "Post"}
          </button>
        </div>
        {comments.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: "#444" }}>No comments yet — be the first!</p>
        ) : (
          <div className="flex flex-col gap-4">
            {comments.map((c) => (
              <div key={c.id} className="flex items-start gap-2.5">
                {c.authorPhoto ? (
                  <img src={c.authorPhoto} alt="" className="rounded-full object-cover flex-shrink-0" style={{ width: 30, height: 30 }} />
                ) : (
                  <div className="rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ width: 30, height: 30, background: "#222", color: "#aaa" }}>
                    {(c.authorName || "U").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold" style={{ color: "#ddd" }}>{c.authorName}</p>
                  <p className="text-sm break-words" style={{ color: "#aaa" }}>{c.text}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <audio
        ref={audioRef}
        src={episode.audioUrl}
        onPlay={() => { setPlaying(true); nativeAudio("start"); }}
        onPause={() => { setPlaying(false); nativeAudio("stop"); }}
        onTimeUpdate={() => {
          const a = audioRef.current; if (!a) return;
          setCurrentTime(a.currentTime);
          if (typeof navigator !== "undefined" && "mediaSession" in navigator && a.duration && isFinite(a.duration)) {
            try { navigator.mediaSession.setPositionState({ duration: a.duration, position: a.currentTime, playbackRate: a.playbackRate }); } catch {}
          }
        }}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={() => { setPlaying(false); nativeAudio("stop"); }}
      />
    </div>
  );
}
