"use client";

import { useState, useEffect, useRef } from "react";
import { collection, doc, getDoc, getDocs, addDoc, serverTimestamp, query, orderBy } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage, OWNER_UIDS } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import Link from "next/link";

interface Episode {
  id: string;
  title: string;
  description?: string;
  audioUrl: string;
  coverUrl?: string;
  hostId: string;
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

function timeAgo(seconds: number) {
  const diff = Date.now() / 1000 - seconds;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function PodcastsPage() {
  const { user, loading: authLoading } = useAuth();
  const [followers, setFollowers] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isOwner = !authLoading && !!user && OWNER_UIDS.includes(user.uid);

  useEffect(() => {
    if (!user || isOwner) return;
    getDoc(doc(db, "users", user.uid, "public", "profile")).then((snap) => {
      if (snap.exists()) {
        setFollowers(snap.data().followersCount ?? 0);
      } else {
        getDoc(doc(db, "users", user.uid)).then((rootSnap) => {
          setFollowers(rootSnap.exists() ? (rootSnap.data().followersCount ?? 0) : 0);
        }).catch(() => setFollowers(0));
      }
    }).catch(() => setFollowers(0));
  }, [user, isOwner]);

  useEffect(() => {
    const q = query(collection(db, "podcasts"), orderBy("publishedAt", "desc"));
    getDocs(q).then((snap) => {
      setEpisodes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Episode, "id">) })));
      setEpisodesLoading(false);
    }).catch(() => setEpisodesLoading(false));
  }, []);

  async function handleUpload() {
    if (!user || !uploadFile || !uploadTitle.trim() || uploading) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const ext = uploadFile.name.split(".").pop();
      const storageRef = ref(storage, `uploads/podcasts/${Date.now()}.${ext}`);
      const task = uploadBytesResumable(storageRef, uploadFile);

      await new Promise<void>((resolve, reject) => {
        task.on("state_changed",
          (snap) => setUploadProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
          reject,
          resolve
        );
      });

      const audioUrl = await getDownloadURL(storageRef);

      // Get duration from audio element
      let duration: number | undefined;
      try {
        const audio = new Audio(audioUrl);
        await new Promise<void>((res) => {
          audio.addEventListener("loadedmetadata", () => { duration = audio.duration; res(); }, { once: true });
          setTimeout(res, 5000);
        });
      } catch {}

      const ep = await addDoc(collection(db, "podcasts"), {
        title: uploadTitle.trim(),
        description: uploadDesc.trim() || null,
        audioUrl,
        hostId: user.uid,
        hostName: user.displayName || "Host",
        hostPhoto: user.photoURL || null,
        duration: duration ?? null,
        plays: 0,
        publishedAt: serverTimestamp(),
      });

      setEpisodes((prev) => [{
        id: ep.id,
        title: uploadTitle.trim(),
        description: uploadDesc.trim() || undefined,
        audioUrl,
        hostId: user.uid,
        hostName: user.displayName || "Host",
        hostPhoto: user.photoURL || undefined,
        duration,
        plays: 0,
      }, ...prev]);

      setShowUpload(false);
      setUploadTitle("");
      setUploadDesc("");
      setUploadFile(null);
    } catch {
      // upload failed silently
    }
    setUploading(false);
  }

  if (authLoading) {
    return <div className="flex justify-center py-32"><div className="spinner" /></div>;
  }

  if (!isOwner) {
    if (followers === null) {
      return <div className="flex justify-center py-32"><div className="spinner" /></div>;
    }
    if (followers < 300) {
      return (
        <div className="max-w-xl mx-auto px-4 py-6 flex flex-col items-center justify-center" style={{ minHeight: "60vh" }}>
          <div className="w-24 h-24 rounded-3xl flex items-center justify-center mb-6"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 44, color: "#555", fontVariationSettings: "'FILL' 1" }}>lock</span>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-4"
            style={{ background: "rgba(255,255,255,0.06)", color: "#aaa", border: "1px solid rgba(255,255,255,0.12)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>group</span>
            300 FOLLOWERS REQUIRED
          </div>
          <h1 className="text-2xl font-bold text-center mb-3" style={{ color: "#f2f2f2" }}>Podcasts</h1>
          <p className="text-sm text-center leading-relaxed" style={{ color: "#555", maxWidth: 280 }}>
            Reach 300 followers to unlock podcasts. You currently have {followers} follower{followers !== 1 ? "s" : ""}.
          </p>
          <div className="mt-6 w-full max-w-xs">
            <div className="flex justify-between text-xs mb-1.5" style={{ color: "#555" }}>
              <span>{followers} followers</span>
              <span>300 needed</span>
            </div>
            <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: "rgba(255,255,255,0.06)" }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, (followers / 300) * 100)}%`, background: "rgba(255,255,255,0.3)" }} />
            </div>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowUpload(false); }}>
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-6"
            style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.08)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#f2f2f2", fontVariationSettings: "'FILL' 1" }}>podcasts</span>
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>New Episode</p>
                <p className="text-xs" style={{ color: "#555" }}>Upload an audio file</p>
              </div>
            </div>

            <input
              type="text"
              placeholder="Episode title"
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              maxLength={100}
              className="w-full px-4 py-3 rounded-xl outline-none text-sm mb-3"
              style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2" }}
            />
            <textarea
              placeholder="Description (optional)"
              value={uploadDesc}
              onChange={(e) => setUploadDesc(e.target.value)}
              maxLength={500}
              rows={3}
              className="w-full px-4 py-3 rounded-xl outline-none text-sm mb-3 resize-none"
              style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2" }}
            />

            <input ref={fileInputRef} type="file" accept="audio/*" className="hidden"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />

            <button onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 rounded-xl text-sm mb-4 flex items-center justify-center gap-2"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px dashed rgba(255,255,255,0.15)", color: uploadFile ? "#f2f2f2" : "#555" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>audio_file</span>
              {uploadFile ? uploadFile.name : "Choose audio file"}
            </button>

            {uploading && (
              <div className="mb-4">
                <div className="flex justify-between text-xs mb-1" style={{ color: "#555" }}>
                  <span>Uploading…</span><span>{uploadProgress}%</span>
                </div>
                <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: "rgba(255,255,255,0.08)" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${uploadProgress}%`, background: "#f2f2f2" }} />
                </div>
              </div>
            )}

            <button onClick={handleUpload}
              disabled={!uploadFile || !uploadTitle.trim() || uploading}
              className="w-full py-3 rounded-xl font-bold text-sm border-none cursor-pointer"
              style={{
                background: (!uploadFile || !uploadTitle.trim() || uploading) ? "rgba(255,255,255,0.08)" : "#f2f2f2",
                color: (!uploadFile || !uploadTitle.trim() || uploading) ? "#444" : "#000",
              }}>
              {uploading ? "Uploading…" : "Publish Episode"}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#f2f2f2" }}>Podcasts</h1>
          <p className="text-sm mt-0.5" style={{ color: "#555" }}>Audio episodes from your creators</p>
        </div>
        {isOwner && (
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full font-bold text-sm border-none cursor-pointer"
            style={{ background: "#f2f2f2", color: "#000" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            New Episode
          </button>
        )}
      </div>

      {episodesLoading ? (
        <div className="flex justify-center py-16"><div className="spinner" /></div>
      ) : episodes.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 36, color: "#333" }}>podcasts</span>
          </div>
          <p className="text-lg font-semibold mb-2" style={{ color: "#f2f2f2" }}>No episodes yet</p>
          {isOwner && (
            <button onClick={() => setShowUpload(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm border-none cursor-pointer mt-4"
              style={{ background: "#f2f2f2", color: "#000" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
              Upload First Episode
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {episodes.map((ep) => (
            <Link key={ep.id} href={`/podcasts/${ep.id}`}
              className="flex items-center gap-4 p-4 rounded-2xl"
              style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)" }}>
                {ep.coverUrl ? (
                  <img src={ep.coverUrl} alt="" className="w-full h-full object-cover rounded-xl" />
                ) : (
                  <span className="material-symbols-outlined" style={{ fontSize: 28, color: "#444", fontVariationSettings: "'FILL' 1" }}>podcasts</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "#f2f2f2" }}>{ep.title}</p>
                {ep.description && (
                  <p className="text-xs mt-0.5 truncate" style={{ color: "#666" }}>{ep.description}</p>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  {ep.duration && (
                    <span className="text-xs" style={{ color: "#555" }}>{formatDuration(ep.duration)}</span>
                  )}
                  {ep.duration && ep.publishedAt && <span style={{ color: "#333", fontSize: 10 }}>·</span>}
                  {ep.publishedAt && (
                    <span className="text-xs" style={{ color: "#555" }}>{timeAgo(ep.publishedAt.seconds)}</span>
                  )}
                </div>
              </div>
              <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: 20, color: "#444" }}>play_circle</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
