"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc, updateDoc, increment } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";

interface Episode {
  id: string;
  title: string;
  description?: string;
  audioUrl: string;
  coverUrl?: string;
  hostName: string;
  hostPhoto?: string;
  duration?: number;
  publishedAt?: { seconds: number };
  plays?: number;
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

  useEffect(() => {
    getDoc(doc(db, "podcasts", epId)).then((snap) => {
      if (snap.exists()) setEpisode({ id: snap.id, ...(snap.data() as Omit<Episode, "id">) });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [epId]);

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
  const init = (episode.hostName || "H").charAt(0).toUpperCase();

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <Link href="/podcasts" className="inline-flex items-center gap-1 text-sm mb-6" style={{ color: "#888" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
        Podcasts
      </Link>

      {/* Cover art */}
      <div className="w-full rounded-3xl flex items-center justify-center mb-8 mx-auto"
        style={{ aspectRatio: "1/1", maxWidth: 280, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)" }}>
        {episode.coverUrl ? (
          <img src={episode.coverUrl} alt="" className="w-full h-full object-cover rounded-3xl" />
        ) : (
          <span className="material-symbols-outlined" style={{ fontSize: 80, color: "#2a2a2a", fontVariationSettings: "'FILL' 1" }}>podcasts</span>
        )}
      </div>

      {/* Title & host */}
      <div className="mb-6">
        <h1 className="text-xl font-bold mb-2" style={{ color: "#f2f2f2" }}>{episode.title}</h1>
        <div className="flex items-center gap-2">
          {episode.hostPhoto ? (
            <img src={episode.hostPhoto} alt="" className="rounded-full object-cover" style={{ width: 22, height: 22 }} />
          ) : (
            <div className="rounded-full flex items-center justify-center text-xs font-bold"
              style={{ width: 22, height: 22, background: "#222", color: "#aaa" }}>{init}</div>
          )}
          <span className="text-sm" style={{ color: "#888" }}>{episode.hostName}</span>
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

      <audio
        ref={audioRef}
        src={episode.audioUrl}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={() => setPlaying(false)}
      />
    </div>
  );
}
