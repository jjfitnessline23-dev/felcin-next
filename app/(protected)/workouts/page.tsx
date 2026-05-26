"use client";

import { useState, useEffect } from "react";
import { collection, query, orderBy, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";

interface SetEntry { reps: number; weight: number; }
interface Exercise { name: string; sets: SetEntry[]; }
interface WorkoutLog {
  id: string; date?: { seconds: number };
  exercises: Exercise[]; notes?: string; durationMins?: number;
}

function formatDate(s: number) {
  return new Date(s * 1000).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function WorkoutsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exercises, setExercises] = useState<Exercise[]>([{ name: "", sets: [{ reps: 10, weight: 0 }] }]);
  const [notes, setNotes] = useState("");
  const [durationMins, setDurationMins] = useState<number | "">("");
  const [prs, setPrs] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, "users", user.uid, "workoutLogs"), orderBy("date", "desc")))
      .then((snap) => {
        const ls = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WorkoutLog, "id">) }));
        setLogs(ls);
        const prMap: Record<string, number> = {};
        for (const log of ls) {
          for (const ex of log.exercises) {
            const best = Math.max(...ex.sets.map((s) => s.weight));
            const key = ex.name.toLowerCase();
            if (best > 0 && (!prMap[key] || best > prMap[key])) prMap[key] = best;
          }
        }
        setPrs(prMap);
        setLoading(false);
      }).catch(() => setLoading(false));
  }, [user]);

  function addExercise() { setExercises((p) => [...p, { name: "", sets: [{ reps: 10, weight: 0 }] }]); }
  function removeExercise(ei: number) { setExercises((p) => p.filter((_, i) => i !== ei)); }
  function addSet(ei: number) { setExercises((p) => p.map((e, i) => i === ei ? { ...e, sets: [...e.sets, { reps: 10, weight: 0 }] } : e)); }
  function removeSet(ei: number, si: number) { setExercises((p) => p.map((e, i) => i === ei && e.sets.length > 1 ? { ...e, sets: e.sets.filter((_, j) => j !== si) } : e)); }
  function updateName(ei: number, name: string) { setExercises((p) => p.map((e, i) => i === ei ? { ...e, name } : e)); }
  function updateSet(ei: number, si: number, field: keyof SetEntry, val: number) {
    setExercises((p) => p.map((e, i) => i === ei ? { ...e, sets: e.sets.map((s, j) => j === si ? { ...s, [field]: val } : s) } : e));
  }

  async function saveLog() {
    if (!user || saving || exercises.some((e) => !e.name.trim())) return;
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, "users", user.uid, "workoutLogs"), {
        exercises, notes: notes.trim() || null,
        durationMins: durationMins || null, date: serverTimestamp(),
      });
      const newPrs = { ...prs };
      for (const ex of exercises) {
        const best = Math.max(...ex.sets.map((s) => s.weight));
        const key = ex.name.toLowerCase();
        if (best > 0 && (!newPrs[key] || best > newPrs[key])) newPrs[key] = best;
      }
      setPrs(newPrs);
      setLogs((p) => [{ id: ref.id, exercises, notes: notes.trim() || undefined, durationMins: durationMins || undefined }, ...p]);
      setShowNew(false);
      setExercises([{ name: "", sets: [{ reps: 10, weight: 0 }] }]);
      setNotes(""); setDurationMins("");
    } catch {}
    setSaving(false);
  }

  const totalVolume = (log: WorkoutLog) =>
    log.exercises.reduce((sum, ex) => sum + ex.sets.reduce((s2, set) => s2 + set.reps * set.weight, 0), 0);

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#f2f2f2" }}>Workout Log</h1>
          <p className="text-sm mt-0.5" style={{ color: "#555" }}>Track your lifts and PRs</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full font-bold text-sm border-none cursor-pointer"
          style={{ background: "#f2f2f2", color: "#000" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span> Log
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="spinner" /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 36, color: "#333" }}>fitness_center</span>
          </div>
          <p className="text-lg font-semibold mb-1" style={{ color: "#f2f2f2" }}>No workouts logged yet</p>
          <p className="text-sm mb-5" style={{ color: "#555" }}>Start tracking your progress</p>
          <button onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm border-none cursor-pointer"
            style={{ background: "#f2f2f2", color: "#000" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span> Log First Workout
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {logs.map((log) => {
            const vol = totalVolume(log);
            const hasPr = log.exercises.some((ex) => {
              const best = Math.max(...ex.sets.map((s) => s.weight));
              return best > 0 && prs[ex.name.toLowerCase()] === best;
            });
            return (
              <div key={log.id} className="p-4 rounded-2xl" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>
                    {log.date ? formatDate(log.date.seconds) : "Today"}
                    {log.durationMins ? <span className="font-normal ml-2" style={{ color: "#555" }}>{log.durationMins}m</span> : null}
                  </p>
                  {hasPr && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                      style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.25)" }}>
                      🏆 PR
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  {log.exercises.map((ex, i) => {
                    const best = Math.max(...ex.sets.map((s) => s.weight));
                    const isPr = best > 0 && prs[ex.name.toLowerCase()] === best;
                    return (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm" style={{ color: "#f2f2f2" }}>{ex.name}</span>
                          {isPr && <span className="text-xs font-bold" style={{ color: "#fbbf24" }}>PR</span>}
                        </div>
                        <span className="text-xs" style={{ color: "#555" }}>
                          {ex.sets.length}× {ex.sets.map((s) => `${s.reps}${s.weight > 0 ? `@${s.weight}` : ""}`).join(", ")}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {vol > 0 && <p className="text-xs mt-2" style={{ color: "#444" }}>{vol.toLocaleString()} kg volume</p>}
                {log.notes && <p className="text-xs mt-1 italic" style={{ color: "#444" }}>{log.notes}</p>}
              </div>
            );
          })}
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowNew(false); }}>
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 overflow-y-auto"
            style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.1)", maxHeight: "90vh" }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-base font-bold" style={{ color: "#f2f2f2" }}>Log Workout</p>
              <input type="number" placeholder="Duration (min)" value={durationMins}
                onChange={(e) => setDurationMins(e.target.value ? Number(e.target.value) : "")}
                className="px-3 py-1.5 rounded-lg outline-none text-xs w-32 text-right"
                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2" }} />
            </div>

            {exercises.map((ex, ei) => (
              <div key={ei} className="mb-4 p-3 rounded-xl" style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <input type="text" placeholder={`Exercise ${ei + 1}`} value={ex.name}
                    onChange={(e) => updateName(ei, e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg outline-none text-sm"
                    style={{ background: "#222", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2" }} />
                  {exercises.length > 1 && (
                    <button onClick={() => removeExercise(ei)} className="border-none bg-transparent cursor-pointer">
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: "#444" }}>close</span>
                    </button>
                  )}
                </div>
                <div className="flex text-xs font-bold mb-1.5 px-1 gap-2" style={{ color: "#444" }}>
                  <span style={{ width: 20 }}>#</span>
                  <span className="flex-1 text-center">Reps</span>
                  <span className="flex-1 text-center">kg</span>
                  <span style={{ width: 20 }} />
                </div>
                {ex.sets.map((s, si) => (
                  <div key={si} className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs text-center" style={{ width: 20, color: "#444" }}>{si + 1}</span>
                    <input type="number" value={s.reps} min={1}
                      onChange={(e) => updateSet(ei, si, "reps", Number(e.target.value))}
                      className="flex-1 px-2 py-1.5 rounded-lg outline-none text-sm text-center"
                      style={{ background: "#222", border: "1px solid rgba(255,255,255,0.06)", color: "#f2f2f2" }} />
                    <input type="number" value={s.weight} min={0} step={0.5}
                      onChange={(e) => updateSet(ei, si, "weight", Number(e.target.value))}
                      className="flex-1 px-2 py-1.5 rounded-lg outline-none text-sm text-center"
                      style={{ background: "#222", border: "1px solid rgba(255,255,255,0.06)", color: "#f2f2f2" }} />
                    <button onClick={() => removeSet(ei, si)} className="border-none bg-transparent cursor-pointer" style={{ width: 20 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 15, color: "#333" }}>remove</span>
                    </button>
                  </div>
                ))}
                <button onClick={() => addSet(ei)}
                  className="mt-1 flex items-center gap-1 text-xs border-none bg-transparent cursor-pointer"
                  style={{ color: "#555" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span> Add set
                </button>
              </div>
            ))}

            <button onClick={addExercise}
              className="w-full py-2.5 rounded-xl text-sm mb-3 border-none cursor-pointer flex items-center justify-center gap-1.5"
              style={{ background: "rgba(255,255,255,0.04)", color: "#555", border: "1px dashed rgba(255,255,255,0.1)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span> Add Exercise
            </button>

            <textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)}
              rows={2} className="w-full px-3 py-2.5 rounded-xl outline-none text-sm resize-none mb-4"
              style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)", color: "#f2f2f2" }} />

            <button onClick={saveLog} disabled={saving || exercises.some((e) => !e.name.trim())}
              className="w-full py-3 rounded-xl font-bold text-sm border-none cursor-pointer"
              style={{
                background: (saving || exercises.some((e) => !e.name.trim())) ? "rgba(255,255,255,0.08)" : "#f2f2f2",
                color: (saving || exercises.some((e) => !e.name.trim())) ? "#444" : "#000",
              }}>
              {saving ? "Saving…" : "Save Workout"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
