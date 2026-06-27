"use client";

import { useState, useEffect, useRef } from "react";
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp } from "firebase/firestore";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage, OWNER_UIDS } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { GhostCardSkeleton } from "@/components/SkeletonCard";
import Link from "next/link";

interface Exercise { name: string; durationSecs: number; sets?: number; reps?: number; weightKg?: number; }
interface GhostWorkout {
  id: string; title: string; description?: string;
  exercises: Exercise[]; hostId: string; hostName: string;
  hostPhoto?: string; sessionCount?: number; videoUrl?: string;
  createdAt?: { seconds: number };
}

function totalDuration(exercises: Exercise[]) {
  const t = exercises.reduce((s, e) => s + e.durationSecs, 0);
  const m = Math.floor(t / 60); const s = t % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export default function GhostPage() {
  const { user } = useAuth();
  const [workouts, setWorkouts] = useState<GhostWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [exercises, setExercises] = useState<Exercise[]>([{ name: "", durationSecs: 30 }]);
  const [saving, setSaving] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [saveError, setSaveError] = useState("");
  const videoInputRef = useRef<HTMLInputElement>(null);

  const isOwner = user && OWNER_UIDS.includes(user.uid);
  const canCreate = !!user;

  useEffect(() => {
    getDocs(query(collection(db, "ghostWorkouts"), orderBy("createdAt", "desc")))
      .then((snap) => {
        setWorkouts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GhostWorkout, "id">) })));
        setLoading(false);
      }).catch(() => setLoading(false));
  }, []);

  function addExercise() { setExercises((p) => [...p, { name: "", durationSecs: 30 }]); }
  function removeExercise(i: number) { setExercises((p) => p.filter((_, idx) => idx !== i)); }
  function updateExercise(i: number, field: keyof Exercise, val: string | number | undefined) {
    setExercises((p) => p.map((e, idx) => idx === i ? { ...e, [field]: val } : e));
  }

  async function handleVideoSelect(file: File) {
    if (!user || uploading) return;
    setUploading(true); setUploadProgress(0);
    try {
      const ext = file.name.split(".").pop() || "mp4";
      const sRef = storageRef(storage, `uploads/media/${user.uid}/ghost_${Date.now()}.${ext}`);
      const task = uploadBytesResumable(sRef, file, { contentType: file.type });
      const url: string = await new Promise((resolve, reject) => {
        task.on("state_changed",
          (snap) => setUploadProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
          reject,
          () => getDownloadURL(task.snapshot.ref).then(resolve).catch(reject)
        );
      });
      setVideoUrl(url);
    } catch { setVideoUrl(""); }
    setUploading(false);
  }

  async function saveWorkout() {
    if (!user || saving || uploading) return;
    if (!title.trim()) { setSaveError("Please add a title."); return; }
    if (exercises.some((e) => !e.name.trim())) { setSaveError("Please name all exercises."); return; }
    setSaving(true); setSaveError("");
    try {
      const docRef = await addDoc(collection(db, "ghostWorkouts"), {
        title: title.trim(), description: desc.trim() || null,
        exercises, hostId: user.uid,
        hostName: user.displayName || "Host",
        hostPhoto: user.photoURL || null,
        videoUrl: videoUrl || null,
        sessionCount: 0, createdAt: serverTimestamp(),
      });
      setWorkouts((p) => [{ id: docRef.id, title: title.trim(), description: desc.trim() || undefined, exercises, hostId: user.uid, hostName: user.displayName || "Host", hostPhoto: user.photoURL || undefined, videoUrl: videoUrl || undefined, sessionCount: 0 }, ...p]);
      setShowCreate(false); setTitle(""); setDesc(""); setExercises([{ name: "", durationSecs: 30 }]); setVideoUrl(""); setUploadProgress(0); setSaveError("");
    } catch (err: unknown) {
      const msg = (err as { code?: string })?.code || "Failed to publish. Please try again.";
      setSaveError(msg);
    }
    setSaving(false);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6" style={{ position: "relative" }}>

      {/* Full-page ghost wallpaper */}
      <div aria-hidden="true" style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden",
        background: "radial-gradient(ellipse 80% 60% at 70% 40%, rgba(109,40,217,0.07) 0%, transparent 70%)",
      }}>
        <img src="/static/logo-full.svg" alt="" className="ghost-float" style={{
          position: "absolute", right: "-5%", top: "50%", transform: "translateY(-50%)",
          width: "55vw", maxWidth: 520, opacity: 0.05, userSelect: "none",
        }} />
        <img src="/static/logo-full.svg" alt="" className="ghost-float-bottom" style={{
          position: "absolute", left: "-10%", bottom: "10%",
          width: "30vw", maxWidth: 280, opacity: 0.03, userSelect: "none",
        }} />
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowCreate(false); setSaveError(""); } }}>
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl overflow-y-auto"
            style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.1)", maxHeight: "85dvh", marginBottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)", padding: "24px 24px calc(env(safe-area-inset-bottom, 16px) + 24px)" }}
            onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-bold mb-4" style={{ color: "#f2f2f2" }}>Create Ghost Workout</p>
            <input type="text" placeholder="Workout title" value={title}
              onChange={(e) => setTitle(e.target.value)} maxLength={80}
              className="w-full px-4 py-3 rounded-xl outline-none text-sm mb-3"
              style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2" }} />
            <textarea placeholder="Description (optional)" value={desc}
              onChange={(e) => setDesc(e.target.value)} maxLength={300} rows={2}
              className="w-full px-4 py-3 rounded-xl outline-none text-sm mb-4 resize-none"
              style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#f2f2f2" }} />
            <p className="text-xs font-bold mb-3" style={{ color: "#555" }}>EXERCISES</p>
            <div className="flex flex-col gap-3 mb-3">
              {exercises.map((ex, i) => (
                <div key={i} className="flex flex-col gap-1.5 p-3 rounded-xl" style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.07)" }}>
                  {/* Name + duration + remove */}
                  <div className="flex gap-2 items-center">
                    <input type="text" placeholder={`Exercise ${i + 1}`} value={ex.name}
                      onChange={(e) => updateExercise(i, "name", e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg outline-none text-sm"
                      style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2" }} />
                    <select value={ex.durationSecs} onChange={(e) => updateExercise(i, "durationSecs", Number(e.target.value))}
                      className="px-2 py-2 rounded-lg outline-none text-sm"
                      style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2" }}>
                      {[15,20,30,45,60,90,120,180,240,300].map((s) => (
                        <option key={s} value={s}>{s < 60 ? `${s}s` : `${s/60}m`}</option>
                      ))}
                    </select>
                    {exercises.length > 1 && (
                      <button type="button" onClick={() => removeExercise(i)} className="border-none bg-transparent cursor-pointer p-1">
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#444" }}>close</span>
                      </button>
                    )}
                  </div>
                  {/* Sets × Reps @ Weight (optional) */}
                  <div className="flex gap-2 items-center">
                    <input type="number" placeholder="Sets" min={1} max={20} value={ex.sets ?? ""}
                      onChange={(e) => updateExercise(i, "sets", e.target.value ? Number(e.target.value) : undefined)}
                      className="w-14 px-2 py-1.5 rounded-lg outline-none text-xs text-center"
                      style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.06)", color: "#f2f2f2" }} />
                    <span className="text-xs" style={{ color: "#444" }}>sets ×</span>
                    <input type="number" placeholder="Reps" min={1} max={100} value={ex.reps ?? ""}
                      onChange={(e) => updateExercise(i, "reps", e.target.value ? Number(e.target.value) : undefined)}
                      className="w-14 px-2 py-1.5 rounded-lg outline-none text-xs text-center"
                      style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.06)", color: "#f2f2f2" }} />
                    <span className="text-xs" style={{ color: "#444" }}>reps @</span>
                    <input type="number" placeholder="kg" min={0} step={0.5} value={ex.weightKg ?? ""}
                      onChange={(e) => updateExercise(i, "weightKg", e.target.value ? Number(e.target.value) : undefined)}
                      className="w-16 px-2 py-1.5 rounded-lg outline-none text-xs text-center"
                      style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.06)", color: "#f2f2f2" }} />
                    <span className="text-xs" style={{ color: "#444" }}>kg</span>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={addExercise}
              className="w-full py-2.5 rounded-xl text-sm mb-4 border-none cursor-pointer flex items-center justify-center gap-1.5"
              style={{ background: "rgba(255,255,255,0.04)", color: "#555", border: "1px dashed rgba(255,255,255,0.1)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span> Add Exercise
            </button>
            {/* Video upload */}
            <div className="mb-4">
              <p className="text-xs font-bold mb-2" style={{ color: "#555" }}>WORKOUT VIDEO (optional)</p>
              {videoUrl ? (
                <div className="rounded-xl overflow-hidden relative" style={{ background: "#000", border: "1px solid rgba(167,139,250,0.3)" }}>
                  <video src={videoUrl} controls className="w-full" style={{ maxHeight: 180, display: "block" }} />
                  <button type="button" onClick={() => { setVideoUrl(""); setUploadProgress(0); }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center border-none cursor-pointer"
                    style={{ background: "rgba(0,0,0,0.7)" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15, color: "#fff" }}>close</span>
                  </button>
                </div>
              ) : uploading ? (
                <div className="rounded-xl p-4" style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.2)" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#a78bfa" }}>upload</span>
                    <span className="text-xs font-semibold" style={{ color: "#a78bfa" }}>Uploading… {uploadProgress}%</span>
                  </div>
                  <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: "rgba(255,255,255,0.08)" }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${uploadProgress}%`, background: "#a78bfa" }} />
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => videoInputRef.current?.click()}
                  className="w-full py-3 rounded-xl text-sm border-none cursor-pointer flex items-center justify-center gap-2"
                  style={{ background: "rgba(255,255,255,0.04)", color: "#666", border: "1px dashed rgba(255,255,255,0.1)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>video_file</span>
                  Upload a workout video
                </button>
              )}
              <input ref={videoInputRef} type="file" accept="video/*" className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handleVideoSelect(e.target.files[0]); e.target.value = ""; }} />
            </div>

            {saveError && (
              <p className="text-xs mb-3 px-1 font-medium" style={{ color: "#f87171" }}>{saveError}</p>
            )}

            <button type="button" onClick={saveWorkout} disabled={saving || uploading}
              className="w-full py-3 rounded-xl font-bold text-sm border-none cursor-pointer"
              style={{ background: saving || uploading ? "rgba(255,255,255,0.08)" : "#f2f2f2", color: saving || uploading ? "#444" : "#000" }}>
              {saving ? "Saving…" : uploading ? "Uploading video…" : "Publish Ghost Workout"}
            </button>
          </div>
        </div>
      )}

      {/* Hero wallpaper banner */}
      <div className="rounded-2xl mb-6 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0c0818 0%, #100c22 60%, #0a0814 100%)", border: "1px solid rgba(109,40,217,0.35)", minHeight: 200 }}>

        {/* Large ghost logo — background watermark */}
        <img src="/static/logo-full.svg" alt="" aria-hidden="true" className="ghost-float"
          style={{ position: "absolute", right: -40, top: "50%", transform: "translateY(-50%)", width: 220, height: 220, opacity: 0.13, pointerEvents: "none", userSelect: "none" }} />

        {/* Purple glow blob */}
        <div className="ghost-glow-pulse" style={{ position: "absolute", top: -40, right: 40, width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, rgba(109,40,217,0.25) 0%, transparent 70%)", pointerEvents: "none" }} />

        {/* Content */}
        <div className="relative p-6" style={{ zIndex: 1 }}>
          {/* Brand row */}
          <div className="flex items-center gap-2 mb-4">
            <img src="/static/logo-nav.svg" alt="Ghost Workout" className="ghost-icon-float" style={{ width: 34, height: 34, borderRadius: 10 }} />
            <span className="text-[11px] font-bold tracking-[0.2em]" style={{ color: "#6d28d9" }}>GHOST WORKOUT</span>
          </div>

          {/* Headline */}
          <h1 className="font-bold mb-1" style={{ fontSize: 26, lineHeight: 1.15, color: "#f3e8ff", letterSpacing: "-0.5px" }}>
            Train with<br />the Ghost.
          </h1>

          {/* EKG line divider */}
          <svg width="120" height="20" viewBox="0 0 120 20" style={{ display: "block", margin: "10px 0 10px" }}>
            <path d="M 0,10 L 28,10 L 32,7 L 36,10 L 42,10 L 45,13 L 50,2 L 55,14 L 58,10 C 62,10 64,5 68,10 L 120,10"
              fill="none" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
          </svg>

          <p className="text-sm mb-5" style={{ color: "#6b5a8a", maxWidth: 200, lineHeight: 1.5 }}>
            Real exercises. Real timing. Like someone&apos;s right there with you.
          </p>

          {canCreate && (
            <button onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm border-none cursor-pointer"
              style={{ background: "rgba(109,40,217,0.25)", color: "#c4b5fd", border: "1px solid rgba(109,40,217,0.4)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
              Create a Ghost Workout
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1,2,3].map((i) => <GhostCardSkeleton key={i} />)}
        </div>
      ) : workouts.length === 0 ? (
        <div className="ghost-bg text-center py-16 rounded-3xl">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 32, color: "#7c6aad" }}>sprint</span>
          </div>
          <p className="text-base font-semibold mb-2" style={{ color: "#f2f2f2" }}>No workouts yet</p>
          <p className="text-sm mb-5" style={{ color: "#555" }}>Be the first to create a Ghost Workout for the community.</p>
          {canCreate && (
            <button onClick={() => setShowCreate(true)}
              className="px-5 py-2.5 rounded-xl font-bold text-sm border-none cursor-pointer"
              style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.3)" }}>
              Create the first one
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {workouts.map((w) => {
            const init = (w.hostName || "H").charAt(0).toUpperCase();
            return (
              <div key={w.id} className="rounded-2xl overflow-hidden"
                style={{ background: "#131313", border: "1px solid rgba(167,139,250,0.15)" }}>
                {/* Card body */}
                <div className="flex items-start gap-4 p-4">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.25)" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 28, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>sprint</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>{w.title}</p>
                    {w.description && <p className="text-xs mt-0.5 truncate" style={{ color: "#555" }}>{w.description}</p>}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.05)", color: "#666" }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 11 }}>fitness_center</span>
                        {w.exercises.length} exercises
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.05)", color: "#666" }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 11 }}>timer</span>
                        {totalDuration(w.exercises)}
                      </span>
                      {w.videoUrl && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 11 }}>play_circle</span>
                          Video
                        </span>
                      )}
                      {(w.sessionCount ?? 0) > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(167,139,250,0.12)", color: "#a78bfa" }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 11 }}>group</span>
                          {w.sessionCount} trained
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 pt-1">
                    {w.hostPhoto
                      ? <img src={w.hostPhoto} alt="" className="rounded-full object-cover" style={{ width: 22, height: 22 }} />
                      : <div className="rounded-full flex items-center justify-center text-xs font-bold" style={{ width: 22, height: 22, background: "#222", color: "#aaa", fontSize: 9 }}>{init}</div>}
                  </div>
                </div>
                {/* Start button strip */}
                <Link href={`/ghost/${w.id}`}
                  className="flex items-center justify-center gap-2 py-3 font-bold text-sm"
                  style={{ background: "rgba(167,139,250,0.15)", borderTop: "1px solid rgba(167,139,250,0.15)", color: "#c4b5fd" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1" }}>play_circle</span>
                  Start Ghost Session
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
