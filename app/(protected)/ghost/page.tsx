"use client";

import { useState, useEffect } from "react";
import { collection, doc, addDoc, getDocs, query, orderBy, serverTimestamp } from "firebase/firestore";
import { db, OWNER_UIDS } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
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

  const isOwner = user && OWNER_UIDS.includes(user.uid);

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

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#f2f2f2" }}>Ghost Workouts</h1>
          <p className="text-sm mt-0.5" style={{ color: "#555" }}>Work out alongside a recorded session</p>
        </div>
        {isOwner && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full font-bold text-sm border-none cursor-pointer"
            style={{ background: "#f2f2f2", color: "#000" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span> Create
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="spinner" /></div>
      ) : workouts.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 36, color: "#333" }}>sprint</span>
          </div>
          <p className="text-lg font-semibold mb-1" style={{ color: "#f2f2f2" }}>No ghost workouts yet</p>
          <p className="text-sm" style={{ color: "#555" }}>The owner will add workouts for you to follow</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {workouts.map((w) => {
            const init = (w.hostName || "H").charAt(0).toUpperCase();
            return (
              <Link key={w.id} href={`/ghost/${w.id}`}
                className="flex items-center gap-4 p-4 rounded-2xl"
                style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 28, color: "#555", fontVariationSettings: "'FILL' 1" }}>sprint</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>{w.title}</p>
                  {w.description && <p className="text-xs mt-0.5 truncate" style={{ color: "#666" }}>{w.description}</p>}
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-xs" style={{ color: "#555" }}>{w.exercises.length} exercises</span>
                    <span style={{ color: "#333", fontSize: 10 }}>·</span>
                    <span className="text-xs" style={{ color: "#555" }}>{totalDuration(w.exercises)}</span>
                    {(w.sessionCount ?? 0) > 0 && <>
                      <span style={{ color: "#333", fontSize: 10 }}>·</span>
                      <span className="text-xs" style={{ color: "#555" }}>{w.sessionCount} sessions</span>
                    </>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {w.hostPhoto
                    ? <img src={w.hostPhoto} alt="" className="rounded-full object-cover" style={{ width: 22, height: 22 }} />
                    : <div className="rounded-full flex items-center justify-center text-xs font-bold" style={{ width: 22, height: 22, background: "#222", color: "#aaa" }}>{init}</div>}
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#333" }}>play_circle</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
