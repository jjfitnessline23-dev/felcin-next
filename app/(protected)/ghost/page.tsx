"use client";

import { useState, useEffect } from "react";
import { collection, doc, addDoc, getDocs, query, orderBy, serverTimestamp } from "firebase/firestore";
import { db, OWNER_UIDS } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { GhostCardSkeleton } from "@/components/SkeletonCard";
import Link from "next/link";

interface Exercise { name: string; durationSecs: number; }
interface GhostWorkout {
  id: string; title: string; description?: string;
  exercises: Exercise[]; hostId: string; hostName: string;
  hostPhoto?: string; sessionCount?: number;
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

  const isOwner = user && OWNER_UIDS.includes(user.uid); // kept for admin features
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
  function updateExercise(i: number, field: keyof Exercise, val: string | number) {
    setExercises((p) => p.map((e, idx) => idx === i ? { ...e, [field]: val } : e));
  }

  async function saveWorkout() {
    if (!user || !title.trim() || exercises.some((e) => !e.name.trim()) || saving) return;
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, "ghostWorkouts"), {
        title: title.trim(), description: desc.trim() || null,
        exercises, hostId: user.uid,
        hostName: user.displayName || "Host",
        hostPhoto: user.photoURL || null,
        sessionCount: 0, createdAt: serverTimestamp(),
      });
      setWorkouts((p) => [{ id: ref.id, title: title.trim(), description: desc.trim() || undefined, exercises, hostId: user.uid, hostName: user.displayName || "Host", hostPhoto: user.photoURL || undefined, sessionCount: 0 }, ...p]);
      setShowCreate(false); setTitle(""); setDesc(""); setExercises([{ name: "", durationSecs: 30 }]);
    } catch {}
    setSaving(false);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: "rgba(0,0,0,0.8)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-6 overflow-y-auto"
            style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.1)", maxHeight: "90vh" }}>
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
            <div className="flex flex-col gap-2 mb-3">
              {exercises.map((ex, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input type="text" placeholder={`Exercise ${i + 1}`} value={ex.name}
                    onChange={(e) => updateExercise(i, "name", e.target.value)}
                    className="flex-1 px-3 py-2.5 rounded-xl outline-none text-sm"
                    style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2" }} />
                  <select value={ex.durationSecs} onChange={(e) => updateExercise(i, "durationSecs", Number(e.target.value))}
                    className="px-2 py-2.5 rounded-xl outline-none text-sm"
                    style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2" }}>
                    {[15,20,30,45,60,90,120,180,240,300].map((s) => (
                      <option key={s} value={s}>{s < 60 ? `${s}s` : `${s/60}m`}</option>
                    ))}
                  </select>
                  {exercises.length > 1 && (
                    <button onClick={() => removeExercise(i)} className="border-none bg-transparent cursor-pointer p-1">
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#444" }}>close</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addExercise}
              className="w-full py-2.5 rounded-xl text-sm mb-4 border-none cursor-pointer flex items-center justify-center gap-1.5"
              style={{ background: "rgba(255,255,255,0.04)", color: "#555", border: "1px dashed rgba(255,255,255,0.1)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span> Add Exercise
            </button>
            <button onClick={saveWorkout} disabled={!title.trim() || exercises.some((e) => !e.name.trim()) || saving}
              className="w-full py-3 rounded-xl font-bold text-sm border-none cursor-pointer"
              style={{ background: (!title.trim() || saving) ? "rgba(255,255,255,0.08)" : "#f2f2f2", color: (!title.trim() || saving) ? "#444" : "#000" }}>
              {saving ? "Saving…" : "Publish Ghost Workout"}
            </button>
          </div>
        </div>
      )}

      {/* Hero banner */}
      <div className="rounded-2xl p-5 mb-6 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, rgba(167,139,250,0.15) 0%, rgba(139,92,246,0.08) 100%)", border: "1px solid rgba(167,139,250,0.25)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold mb-1" style={{ color: "#c4b5fd" }}>Ghost Workouts</h1>
            <p className="text-sm leading-relaxed" style={{ color: "#7c6aad" }}>
              Train alongside a recorded session — real exercises, real timing, like someone&apos;s right there with you.
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(167,139,250,0.2)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 26, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>sprint</span>
          </div>
        </div>
        {canCreate && (
          <button onClick={() => setShowCreate(true)}
            className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm border-none cursor-pointer"
            style={{ background: "rgba(167,139,250,0.2)", color: "#c4b5fd", border: "1px solid rgba(167,139,250,0.3)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            Create a Ghost Workout
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[1,2,3].map((i) => <GhostCardSkeleton key={i} />)}
        </div>
      ) : workouts.length === 0 ? (
        <div className="text-center py-16">
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
