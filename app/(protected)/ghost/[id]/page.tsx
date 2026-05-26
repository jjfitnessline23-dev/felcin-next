"use client";

export function generateStaticParams() { return []; }
export const dynamicParams = process.env.NEXT_PUBLIC_CAPACITOR_BUILD !== "true";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc, updateDoc, increment } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Link from "next/link";

interface Exercise { name: string; durationSecs: number; }
interface GhostWorkout {
  id: string; title: string; description?: string;
  exercises: Exercise[]; hostName: string; hostPhoto?: string; sessionCount?: number;
}

export default function GhostSessionPage() {
  const params = useParams();
  const id = params.id as string;
  const [workout, setWorkout] = useState<GhostWorkout | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<"ready" | "active" | "rest" | "done">("ready");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [sessionRecorded, setSessionRecorded] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getDoc(doc(db, "ghostWorkouts", id)).then((snap) => {
      if (snap.exists()) setWorkout({ id: snap.id, ...(snap.data() as Omit<GhostWorkout, "id">) });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  const advance = useCallback((idx: number, wkt: GhostWorkout) => {
    if (idx >= wkt.exercises.length) {
      setPhase("done");
      if (!sessionRecorded) {
        setSessionRecorded(true);
        updateDoc(doc(db, "ghostWorkouts", id), { sessionCount: increment(1) }).catch(() => {});
      }
      return;
    }
    setCurrentIdx(idx);
    setTimeLeft(wkt.exercises[idx].durationSecs);
    setPhase("active");
  }, [id, sessionRecorded]);

  useEffect(() => {
    if (phase !== "active" || !workout) return;
    intervalRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(intervalRef.current!);
          // 5s rest between exercises, skip rest after last
          if (currentIdx + 1 < workout.exercises.length) {
            setPhase("rest");
            setTimeLeft(5);
          } else {
            advance(currentIdx + 1, workout);
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current!);
  }, [phase, currentIdx, workout, advance]);

  useEffect(() => {
    if (phase !== "rest" || !workout) return;
    intervalRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(intervalRef.current!);
          advance(currentIdx + 1, workout);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current!);
  }, [phase, currentIdx, workout, advance]);

  function start() {
    if (!workout) return;
    advance(0, workout);
  }

  function skip() {
    if (!workout) return;
    clearInterval(intervalRef.current!);
    advance(currentIdx + 1, workout);
  }

  if (loading) return <div className="flex justify-center py-32"><div className="spinner" /></div>;
  if (!workout) return (
    <div className="flex flex-col items-center justify-center py-32">
      <p className="text-lg font-semibold mb-3" style={{ color: "#f2f2f2" }}>Workout not found</p>
      <Link href="/ghost" className="text-sm" style={{ color: "#888" }}>← Ghost Workouts</Link>
    </div>
  );

  const current = workout.exercises[currentIdx];
  const progress = phase === "active" && current ? ((current.durationSecs - timeLeft) / current.durationSecs) * 100 : phase === "rest" ? ((5 - timeLeft) / 5) * 100 : 0;
  const init = (workout.hostName || "H").charAt(0).toUpperCase();

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <Link href="/ghost" className="inline-flex items-center gap-1 text-sm mb-5" style={{ color: "#888" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
        Ghost Workouts
      </Link>

      {/* Ready state */}
      {phase === "ready" && (
        <>
          <div className="rounded-2xl p-6 mb-4" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-3 mb-4">
              {workout.hostPhoto
                ? <img src={workout.hostPhoto} alt="" className="rounded-full object-cover" style={{ width: 36, height: 36 }} />
                : <div className="rounded-full flex items-center justify-center font-bold" style={{ width: 36, height: 36, background: "#222", color: "#aaa" }}>{init}</div>}
              <div>
                <p className="text-xs" style={{ color: "#555" }}>Ghost by</p>
                <p className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>{workout.hostName}</p>
              </div>
            </div>
            <h1 className="text-xl font-bold mb-1" style={{ color: "#f2f2f2" }}>{workout.title}</h1>
            {workout.description && <p className="text-sm mb-4" style={{ color: "#666" }}>{workout.description}</p>}
            <div className="flex flex-col gap-2">
              {workout.exercises.map((ex, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-bold w-5 text-center" style={{ color: "#444" }}>{i + 1}</span>
                    <span className="text-sm" style={{ color: "#f2f2f2" }}>{ex.name}</span>
                  </div>
                  <span className="text-xs font-semibold" style={{ color: "#555" }}>
                    {ex.durationSecs < 60 ? `${ex.durationSecs}s` : `${ex.durationSecs / 60}m`}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <button onClick={start}
            className="w-full py-4 rounded-2xl font-bold text-base border-none cursor-pointer flex items-center justify-center gap-2"
            style={{ background: "#f2f2f2", color: "#000" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}>sprint</span>
            Start Ghost Session
          </button>
        </>
      )}

      {/* Active exercise */}
      {(phase === "active" || phase === "rest") && (
        <div className="flex flex-col items-center">
          <div className="w-full rounded-2xl p-6 mb-4 text-center"
            style={{ background: phase === "rest" ? "#131313" : "rgba(255,255,255,0.04)", border: `1px solid ${phase === "rest" ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.12)"}` }}>
            <p className="text-xs font-bold mb-2" style={{ color: phase === "rest" ? "#555" : "#888" }}>
              {phase === "rest" ? "REST" : `EXERCISE ${currentIdx + 1} OF ${workout.exercises.length}`}
            </p>
            <p className="text-2xl font-bold mb-1" style={{ color: "#f2f2f2" }}>
              {phase === "rest" ? "Rest" : current?.name}
            </p>
            <p className="text-6xl font-bold my-6 tabular-nums" style={{ color: phase === "rest" ? "#555" : "#f2f2f2" }}>{timeLeft}</p>
            {/* Progress bar */}
            <div className="w-full rounded-full overflow-hidden mb-2" style={{ height: 6, background: "rgba(255,255,255,0.06)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: phase === "rest" ? "#333" : "#f2f2f2" }} />
            </div>
            {phase === "rest" && currentIdx + 1 < workout.exercises.length && (
              <p className="text-xs mt-2" style={{ color: "#555" }}>
                Up next: <span style={{ color: "#888" }}>{workout.exercises[currentIdx + 1].name}</span>
              </p>
            )}
          </div>

          {/* Exercise queue */}
          <div className="w-full flex flex-col gap-1.5 mb-6">
            {workout.exercises.map((ex, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl"
                style={{ background: i === currentIdx && phase === "active" ? "rgba(255,255,255,0.08)" : "transparent", opacity: i < currentIdx ? 0.3 : 1 }}>
                <div className="flex items-center gap-2">
                  {i < currentIdx
                    ? <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#444" }}>check</span>
                    : <span className="text-xs w-4 text-center" style={{ color: "#444" }}>{i + 1}</span>}
                  <span className="text-sm" style={{ color: i === currentIdx && phase === "active" ? "#f2f2f2" : "#666" }}>{ex.name}</span>
                </div>
                <span className="text-xs" style={{ color: "#444" }}>{ex.durationSecs < 60 ? `${ex.durationSecs}s` : `${ex.durationSecs / 60}m`}</span>
              </div>
            ))}
          </div>

          <button onClick={skip}
            className="px-6 py-2.5 rounded-full text-sm font-semibold border-none cursor-pointer"
            style={{ background: "rgba(255,255,255,0.06)", color: "#555" }}>
            Skip
          </button>
        </div>
      )}

      {/* Done */}
      {phase === "done" && (
        <div className="flex flex-col items-center py-12">
          <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6"
            style={{ background: "rgba(255,255,255,0.06)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: "#f2f2f2", fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          </div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: "#f2f2f2" }}>Ghost Complete!</h2>
          <p className="text-sm mb-2" style={{ color: "#555" }}>You finished <span style={{ color: "#888" }}>{workout.title}</span></p>
          <p className="text-xs mb-8" style={{ color: "#333" }}>alongside {workout.hostName}&apos;s ghost</p>
          <div className="flex gap-3">
            <button onClick={start}
              className="px-5 py-2.5 rounded-full font-bold text-sm border-none cursor-pointer"
              style={{ background: "rgba(255,255,255,0.08)", color: "#f2f2f2" }}>
              Do it again
            </button>
            <Link href="/ghost"
              className="px-5 py-2.5 rounded-full font-bold text-sm"
              style={{ background: "#f2f2f2", color: "#000" }}>
              More Workouts
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
