"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { useRouter, useSearchParams } from "next/navigation";
import { collection, addDoc, serverTimestamp, Timestamp, getDocs, limit, query } from "@/lib/db";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

interface CollabUser { uid: string; displayName: string; photoURL: string; }

const FILTERS = [
  { name: "Normal", css: "" },
  { name: "Warm",   css: "sepia(0.35) saturate(1.5) brightness(1.05)" },
  { name: "Cool",   css: "hue-rotate(20deg) saturate(1.25) brightness(1.03)" },
  { name: "Vivid",  css: "saturate(1.9) contrast(1.1)" },
  { name: "Fade",   css: "brightness(1.12) contrast(0.82) saturate(0.85)" },
  { name: "B&W",    css: "grayscale(1) contrast(1.15)" },
  { name: "Drama",  css: "contrast(1.45) brightness(0.88) saturate(0.75)" },
  { name: "Sunset", css: "sepia(0.55) hue-rotate(-18deg) saturate(1.6) brightness(1.06)" },
];

type Mode = "post" | "reel" | "story";

const NEEDS_CONVERSION = /\.(mov|hevc|avi|mkv|wmv|flv|3gp|m4v|ts|mts|webm)$/i;
const FFMPEG_CORE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js";
const FFMPEG_WASM = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm";

async function convertToMp4(file: File, onProgress: (pct: number) => void): Promise<File> {
  const ffmpeg = new FFmpeg();
  const coreURL = await toBlobURL(FFMPEG_CORE, "text/javascript");
  const wasmURL = await toBlobURL(FFMPEG_WASM, "application/wasm");
  await ffmpeg.load({ coreURL, wasmURL });
  ffmpeg.on("progress", ({ progress }) => onProgress(Math.round(progress * 100)));
  const inputName = "input" + file.name.slice(file.name.lastIndexOf("."));
  await ffmpeg.writeFile(inputName, await fetchFile(file));
  await ffmpeg.exec(["-i", inputName, "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-c:a", "aac", "-movflags", "+faststart", "-y", "output.mp4"]);
  const raw = await ffmpeg.readFile("output.mp4");
  const outName = file.name.replace(/\.[^.]+$/, ".mp4");
  const src = typeof raw === "string" ? new TextEncoder().encode(raw) : raw;
  const plainBuffer = new ArrayBuffer(src.byteLength);
  new Uint8Array(plainBuffer).set(src);
  return new File([plainBuffer], outName, { type: "video/mp4" });
}

async function uploadFile(file: File, uid: string, onProgress: (pct: number) => void): Promise<string> {
  const ext = file.name.split(".").pop() || "bin";
  const random = Math.random().toString(36).slice(2, 8);
  const storageRef = ref(storage, `uploads/media/${uid}/${Date.now()}_${random}.${ext}`);
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, { contentType: file.type });
    task.on(
      "state_changed",
      (snap) => onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      () => getDownloadURL(task.snapshot.ref).then(resolve).catch(reject),
    );
  });
}

export default function CreatorPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = (searchParams.get("mode") as Mode) || "post";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [caption, setCaption] = useState("");
  const [activeFilter, setActiveFilter] = useState(FILTERS[0]);
  const [status, setStatus] = useState<{ msg: string; type: "error" | "success" | "info" } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [bgUploading, setBgUploading] = useState(false);
  const [bgPct, setBgPct] = useState(0);
  const [converting, setConverting] = useState(false);
  const [convertPct, setConvertPct] = useState(0);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const uploadPromiseRef = useRef<Promise<string> | null>(null);
  const [scheduled, setScheduled] = useState(false);
  const [schedTime, setSchedTime] = useState("");
  const [maxViews, setMaxViews] = useState<number | "">("");
  const [ppvPrice, setPpvPrice] = useState<number | "">("");
  const [collabUser, setCollabUser] = useState<CollabUser | null>(null);
  const [collabSearch, setCollabSearch] = useState("");
  const [collabResults, setCollabResults] = useState<CollabUser[]>([]);
  const [showCollabSearch, setShowCollabSearch] = useState(false);
  const [allUsers, setAllUsers] = useState<CollabUser[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Open photo picker immediately on page load
  useEffect(() => {
    const t = setTimeout(() => fileRef.current?.click(), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!collabSearch.trim()) { setCollabResults([]); return; }
    const load = async () => {
      let users = allUsers;
      if (!users) {
        const snap = await getDocs(query(collection(db, "users"), limit(200)));
        users = snap.docs.map((d) => {
          const data = d.data();
          return { uid: d.id, displayName: data.displayName || data.username || "", photoURL: data.photoURL || "" };
        }).filter((u) => u.uid !== user?.uid);
        setAllUsers(users);
      }
      const q = collabSearch.toLowerCase();
      setCollabResults(users.filter((u) => u.displayName.toLowerCase().includes(q)).slice(0, 6));
    };
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [collabSearch, allUsers, user?.uid]);

  const handleFile = useCallback(async (f: File) => {
    if (f.size > 500 * 1024 * 1024) { setStatus({ msg: "File too large — max 500MB", type: "error" }); return; }
    const mime = f.type || "";
    const fname = f.name.toLowerCase();
    const video = mime.startsWith("video/") || /\.(mp4|mov|avi|webm|mkv|m4v|3gp|hevc|ts|mts|wmv|flv)$/.test(fname);
    setStatus(null);
    setFile(f); setIsVideo(video); setActiveFilter(FILTERS[0]);
    setUploadedUrl(null); setBgUploading(false); setBgPct(0);
    uploadPromiseRef.current = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));

    if (!user) return;

    // Auto-convert non-MP4 videos to MP4 — skip if file > 80MB (FFmpeg.wasm crashes on large files)
    const needsConvert = video && NEEDS_CONVERSION.test(fname) && f.size < 80 * 1024 * 1024;
    if (needsConvert) {
      setConverting(true); setConvertPct(0);
      setStatus({ msg: "Converting video to MP4 for best compatibility…", type: "info" });
      try {
        const converted = await convertToMp4(f, (pct) => setConvertPct(pct));
        setConverting(false);
        setStatus({ msg: "Converted! Uploading…", type: "info" });
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(converted));
        setFile(converted);
        setBgUploading(true); setBgPct(0);
        const promise = uploadFile(converted, user.uid, (pct) => setBgPct(pct));
        uploadPromiseRef.current = promise;
        promise.then((url) => { setUploadedUrl(url); setBgUploading(false); setStatus(null); })
               .catch(() => { setBgUploading(false); setStatus({ msg: "Upload failed. Try again.", type: "error" }); uploadPromiseRef.current = null; });
      } catch {
        setConverting(false);
        setBgUploading(true);
        const promise = uploadFile(f, user.uid, (pct) => setBgPct(pct));
        uploadPromiseRef.current = promise;
        promise.then((url) => { setUploadedUrl(url); setBgUploading(false); setStatus(null); })
               .catch(() => { setBgUploading(false); uploadPromiseRef.current = null; });
      }
    } else {
      setBgUploading(true); setBgPct(0);
      const promise = uploadFile(f, user.uid, (pct) => setBgPct(pct));
      uploadPromiseRef.current = promise;
      promise.then((url) => { setUploadedUrl(url); setBgUploading(false); })
             .catch(() => { setBgUploading(false); uploadPromiseRef.current = null; });
    }
  }, [previewUrl, user]);

  const clearFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null); setPreviewUrl(null); setIsVideo(false); setActiveFilter(FILTERS[0]); setStatus(null);
    setUploadedUrl(null); setBgUploading(false); setBgPct(0); uploadPromiseRef.current = null;
    if (fileRef.current) fileRef.current.value = "";
  };

  const publish = async () => {
    if (!user) return;
    setPublishing(true); setStatus(null);
    try {
      let mediaUrl = ""; let contentType = "text"; let mimeType = "";
      if (file) {
        mimeType = file.type || "";
        const fname = file.name.toLowerCase();
        contentType = (mimeType.startsWith("video/") || /\.(mp4|mov|avi|webm|mkv|m4v|3gp)$/.test(fname)) ? "video" : "image";
        if (uploadedUrl) {
          mediaUrl = uploadedUrl;
        } else if (uploadPromiseRef.current) {
          setStatus({ msg: "Finishing upload…", type: "info" });
          mediaUrl = await uploadPromiseRef.current;
        } else {
          setStatus({ msg: "Uploading…", type: "info" });
          mediaUrl = await uploadFile(file, user.uid, (pct) => { setUploadPct(pct); setStatus({ msg: `Uploading ${pct}%…`, type: "info" }); });
        }
      }
      setStatus({ msg: "Saving…", type: "info" });
      const col = mode === "reel" ? "reels" : "posts";
      const scheduledAt = scheduled && schedTime ? new Date(schedTime) : null;
      const tags = [...new Set((caption.match(/#([a-zA-Z0-9_]+)/g) || []).map((t) => t.slice(1).toLowerCase()))];
      await addDoc(collection(db, col), {
        authorId: user.uid, caption, text: caption, mediaUrl,
        contentType: mode === "story" ? "story" : mode === "reel" ? "reel" : contentType,
        mimeType, likes: 0, comments: 0,
        status: scheduledAt ? "scheduled" : "published",
        isStory: mode === "story", isReel: mode === "reel",
        filter: activeFilter.name !== "Normal" ? activeFilter.name : "",
        filterCss: activeFilter.css || "",
        scheduledAt: scheduledAt ? Timestamp.fromDate(scheduledAt) : null,
        expiresAt: mode === "story" ? Timestamp.fromDate(new Date(Date.now() + 24 * 3600 * 1000)) : null,
        maxViews: mode === "post" && maxViews !== "" ? Number(maxViews) : null,
        ppvPrice: ppvPrice !== "" && Number(ppvPrice) > 0 ? Math.round(Number(ppvPrice) * 100) : null,
        viewCount: 0, tags,
        collabUid: mode === "post" && collabUser ? collabUser.uid : null,
        collabName: mode === "post" && collabUser ? collabUser.displayName : null,
        collabPhoto: mode === "post" && collabUser ? collabUser.photoURL : null,
        createdAt: serverTimestamp(),
      });
      setStatus({ msg: scheduledAt ? "Scheduled!" : mode === "story" ? "Story shared!" : mode === "reel" ? "Reel shared!" : "Posted!", type: "success" });
      setTimeout(() => router.push(mode === "story" ? "/stories" : "/"), 900);
    } catch (err: unknown) {
      setStatus({ msg: (err as Error).message || "Failed. Try again.", type: "error" });
    }
    setPublishing(false);
  };

  const canPublish = !publishing && (!!file || !!caption.trim());

  return (
    <div className="max-w-lg mx-auto min-h-screen" style={{ background: "#090909" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 sticky z-10"
        style={{ top: "env(safe-area-inset-top,0px)", background: "rgba(9,9,9,0.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={() => router.back()} className="icon-btn" style={{ width: 38, height: 38, color: "#f2f2f2" }}>
          <span className="material-symbols-outlined">arrow_back</span>
        </button>

        {/* Mode tabs */}
        <div className="flex p-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
          {(["post", "reel", "story"] as Mode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className="px-4 py-1.5 text-xs font-semibold border-none cursor-pointer capitalize rounded-full transition-all"
              style={{ background: mode === m ? "#fff" : "transparent", color: mode === m ? "#000" : "#666" }}>
              {m}
            </button>
          ))}
        </div>

        <button onClick={publish} disabled={!canPublish}
          className="px-5 py-2 rounded-full text-sm font-bold text-white border-none cursor-pointer"
          style={{ background: canPublish ? "#fff" : "rgba(255,255,255,0.06)", color: canPublish ? "#000" : "#444" }}>
          Share
        </button>
      </div>

      {/* Status banner */}
      {status && (
        <div className="mx-4 mt-3 px-4 py-3 rounded-xl text-sm font-medium" style={{
          background: status.type === "error" ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.06)",
          color: status.type === "error" ? "#f87171" : "#f2f2f2",
          border: `1px solid ${status.type === "error" ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.12)"}`,
        }}>
          {status.msg}
        </div>
      )}

      {/* Media area */}
      <div className="relative" style={{ background: "#000", aspectRatio: "1/1", maxHeight: 480 }}>
        {!file ? (
          <label className="flex flex-col items-center justify-center gap-5 w-full h-full cursor-pointer" style={{ minHeight: 300 }}>
            <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
              style={{ background: "#1c1c1c", border: "1px solid rgba(255,255,255,0.1)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: "#fff" }}>add_a_photo</span>
            </div>
            <div className="text-center px-8">
              <p className="font-semibold text-base mb-1" style={{ color: "#f2f2f2" }}>Tap to add photo or video</p>
              <p className="text-sm" style={{ color: "#555" }}>Up to 200MB</p>
            </div>
          </label>
        ) : (
          <>
            {isVideo
              ? <video key={previewUrl!} src={previewUrl!} controls muted playsInline className="w-full h-full object-contain" style={{ maxHeight: 480, filter: activeFilter.css || "none" }} />
              : <img src={previewUrl!} alt="" className="w-full h-full object-contain" style={{ maxHeight: 480, filter: activeFilter.css || "none" }} />
            }
            <button onClick={clearFile} className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center border-none cursor-pointer"
              style={{ background: "rgba(0,0,0,0.7)", color: "#fff" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
            </button>
            {converting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{ background: "rgba(0,0,0,0.75)" }}>
                <div className="spinner" />
                <p className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>Converting to MP4… {convertPct}%</p>
                <div className="w-48 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${convertPct}%`, background: "#a78bfa" }} />
                </div>
                <p className="text-xs" style={{ color: "#666" }}>Making it compatible with all devices</p>
              </div>
            )}
            {!converting && bgUploading && (
              <div className="absolute bottom-0 left-0 right-0 px-3 pb-3">
                <div className="rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.5)", height: 4 }}>
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${bgPct}%`, background: "#a78bfa" }} />
                </div>
                <p className="text-xs text-center mt-1" style={{ color: "rgba(255,255,255,0.7)" }}>Uploading {bgPct}%…</p>
              </div>
            )}
            {!bgUploading && uploadedUrl && (
              <div className="absolute bottom-3 left-3 flex items-center gap-1 px-2 py-1 rounded-full"
                style={{ background: "rgba(0,0,0,0.6)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#4ade80" }}>check_circle</span>
                <span className="text-xs" style={{ color: "#4ade80" }}>Ready to post</span>
              </div>
            )}
            <label className="absolute bottom-3 right-3 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer"
              style={{ background: "rgba(0,0,0,0.7)", color: "#fff" }}>
              <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
              Change
            </label>
          </>
        )}
      </div>

      {file && (
        <div className="px-4 py-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "#0a0a0a" }}>
      )}

      {/* Filters */}
      {file && (
        <div className="overflow-x-auto py-3 px-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "#0a0a0a", scrollbarWidth: "none" }}>
          <div className="flex gap-3" style={{ width: "max-content" }}>
            {FILTERS.map((f) => (
              <button key={f.name} onClick={() => setActiveFilter(f)} className="flex flex-col items-center gap-1.5 cursor-pointer bg-transparent border-none">
                <div className="rounded-xl overflow-hidden" style={{
                  width: 56, height: 56,
                  border: `2px solid ${activeFilter.name === f.name ? "#fff" : "transparent"}`,
                }}>
                  {previewUrl && (
                    isVideo
                      ? <video src={previewUrl} muted playsInline className="w-full h-full object-cover" style={{ filter: f.css || "none" }} />
                      : <img src={previewUrl} alt={f.name} className="w-full h-full object-cover" style={{ filter: f.css || "none" }} />
                  )}
                </div>
                <span className="text-xs font-medium" style={{ color: activeFilter.name === f.name ? "#fff" : "#555" }}>{f.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Caption + schedule */}
      {file && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2200}
            placeholder="Write a caption… #hashtags"
            rows={3}
            className="w-full resize-none outline-none px-4 py-4 leading-relaxed"
            style={{ background: "transparent", border: "none", color: "#f2f2f2", fontSize: 16 }} />
          <div className="text-right px-4 pb-2 text-xs" style={{ color: "#333" }}>{caption.length}/2,200</div>

          <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#444" }}>schedule</span>
            <label className="text-sm font-medium flex-1 cursor-pointer" style={{ color: "#888" }}>Schedule post</label>
            <label className="relative inline-block w-9 h-5 cursor-pointer">
              <input type="checkbox" checked={scheduled} onChange={(e) => setScheduled(e.target.checked)} className="sr-only" />
              <span className="absolute inset-0 rounded-full transition-colors" style={{ background: scheduled ? "#fff" : "#222" }} />
              <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform" style={{ transform: scheduled ? "translateX(16px)" : "none" }} />
            </label>
            {scheduled && (
              <input type="datetime-local" value={schedTime} onChange={(e) => setSchedTime(e.target.value)}
                className="text-sm rounded-lg px-2 py-1 outline-none"
                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2", colorScheme: "dark" }} />
            )}
          </div>

          {mode === "post" && (
            <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#444" }}>visibility_off</span>
              <div className="flex-1">
                <p className="text-sm font-medium" style={{ color: "#888" }}>Disappear after views</p>
                <p className="text-xs" style={{ color: "#444" }}>Post auto-deletes after this many views</p>
              </div>
              <input
                type="number"
                min={1}
                max={9999}
                placeholder="∞"
                value={maxViews}
                onChange={(e) => setMaxViews(e.target.value === "" ? "" : Math.max(1, parseInt(e.target.value) || 1))}
                className="text-sm rounded-lg px-3 py-1.5 outline-none text-center"
                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2", width: 72 }}
              />
            </div>
          )}

          <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#fbbf24" }}>lock</span>
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: "#888" }}>Pay-per-view price</p>
              <p className="text-xs" style={{ color: "#444" }}>Charge viewers to unlock this post</p>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-sm" style={{ color: "#555" }}>$</span>
              <input
                type="number" min={0.99} max={999} step={0.01} placeholder="Free"
                value={ppvPrice}
                onChange={(e) => setPpvPrice(e.target.value === "" ? "" : parseFloat(e.target.value))}
                className="text-sm rounded-lg px-3 py-1.5 outline-none text-center"
                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2", width: 72 }}
              />
            </div>
          </div>

          {mode === "post" && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#444" }}>group_add</span>
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color: "#888" }}>Collab</p>
                  <p className="text-xs" style={{ color: "#444" }}>Tag another creator as co-author</p>
                </div>
                {collabUser ? (
                  <div className="flex items-center gap-2">
                    {collabUser.photoURL
                      ? <img src={collabUser.photoURL} alt="" className="rounded-full object-cover" style={{ width: 28, height: 28 }} />
                      : <div className="rounded-full flex items-center justify-center text-xs font-bold" style={{ width: 28, height: 28, background: "#222", color: "#aaa" }}>{collabUser.displayName.charAt(0).toUpperCase()}</div>
                    }
                    <span className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>{collabUser.displayName}</span>
                    <button onClick={() => { setCollabUser(null); setCollabSearch(""); }} className="icon-btn" style={{ width: 24, height: 24 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 15, color: "#555" }}>close</span>
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setShowCollabSearch((v) => !v)}
                    className="text-sm font-semibold px-3 py-1.5 rounded-full border-none cursor-pointer"
                    style={{ background: "rgba(255,255,255,0.08)", color: "#f2f2f2" }}>
                    + Add
                  </button>
                )}
              </div>

              {showCollabSearch && !collabUser && (
                <div className="px-4 pb-3">
                  <input
                    type="text"
                    placeholder="Search by name…"
                    value={collabSearch}
                    onChange={(e) => setCollabSearch(e.target.value)}
                    autoFocus
                    className="w-full px-3 py-2 rounded-xl outline-none text-sm"
                    style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2" }}
                  />
                  {collabResults.length > 0 && (
                    <div className="mt-2 rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                      {collabResults.map((u, i) => (
                        <button key={u.uid} onClick={() => { setCollabUser(u); setCollabSearch(""); setShowCollabSearch(false); }}
                          className="flex items-center gap-3 w-full px-3 py-2.5 text-left border-none cursor-pointer"
                          style={{ background: "#131313", borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                          {u.photoURL
                            ? <img src={u.photoURL} alt="" className="rounded-full object-cover shrink-0" style={{ width: 32, height: 32 }} />
                            : <div className="rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ width: 32, height: 32, background: "#222", color: "#aaa" }}>{u.displayName.charAt(0).toUpperCase()}</div>
                          }
                          <span className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>{u.displayName}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Publishing overlay */}
      {publishing && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5" style={{ background: "rgba(0,0,0,0.9)" }}>
          <div className="spinner" />
          <p className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>{status?.msg || "Publishing…"}</p>
          {uploadPct > 0 && uploadPct < 100 && (
            <div className="w-48 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: uploadPct + "%", background: "#fff" }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
