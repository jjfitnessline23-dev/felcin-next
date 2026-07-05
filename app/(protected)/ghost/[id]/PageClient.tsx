"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { doc, getDoc, updateDoc, increment, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import Link from "next/link";

interface Exercise { name: string; durationSecs: number; sets?: number; reps?: number; weightKg?: number; }
interface GhostWorkout {
  id: string; title: string; description?: string;
  exercises: Exercise[]; hostName: string; hostPhoto?: string; sessionCount?: number;
  price?: number | null; authorId?: string; videoUrl?: string;
}

export default function GhostSessionPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const { user } = useAuth();
  const [workout, setWorkout] = useState<GhostWorkout | null>(null);
  const [loading, setLoading] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [buying, setBuying] = useState(false);

  // Check if already purchased
  useEffect(() => {
    if (!user || !id) return;
    getDoc(doc(db, "ghostWorkouts", id, "purchases", user.uid)).then((snap) => { if (snap.exists()) setUnlocked(true); }).catch(() => {});
  }, [user, id]);

  // Handle return from checkout
  useEffect(() => {
    const sessionId = searchParams.get("ppv_session_id");
    if (!sessionId) return;
    fetch(`/api/ppv-verify?session_id=${sessionId}`).then((r) => r.json()).then((d) => { if (d.ok) setUnlocked(true); }).catch(() => {});
  }, [searchParams]);

  const buyWorkout = async () => {
    if (!user || buying || !workout) return;
    setBuying(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/ppv-checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: id, postCol: "ghostWorkouts", authorId: workout.authorId || "", authorName: workout.hostName, priceCents: workout.price, caption: workout.title, token }) });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {}
    setBuying(false);
  };
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
        const totalSecs = wkt.exercises.reduce((s, e) => s + e.durationSecs, 0);
        updateDoc(doc(db, "ghostWorkouts", id), { sessionCount: increment(1) }).catch(() => {});
        addDoc(collection(db, "ghostWorkouts", id, "sessions"), {
          userId: user?.uid || "anonymous",
          userName: user?.displayName || "",
          userPhoto: user?.photoURL || "",
          exercisesCount: wkt.exercises.length,
          totalDurationSecs: totalSecs,
          completedAt: serverTimestamp(),
        }).catch(() => {});
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

  // Locked gate — show purchase screen if price set and not purchased
  if (workout && workout.price && !unlocked && user?.uid !== workout.authorId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center" style={{ background: "#090909" }}>
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5" style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.25)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 36, color: "#fbbf24", fontVariationSettings: "'FILL' 1" }}>lock</span>
        </div>
        <h2 className="text-2xl font-bold mb-2" style={{ color: "#f2f2f2" }}>{workout.title}</h2>
        <p className="text-sm mb-2" style={{ color: "#555" }}>by {workout.hostName}</p>
        <p className="text-sm mb-8" style={{ color: "#666" }}>This is a premium Ghost Workout. Unlock it once and train as many times as you want.</p>
        <button onClick={buyWorkout} disabled={buying}
          className="px-8 py-4 rounded-2xl font-bold text-base border-none cursor-pointer mb-3"
          style={{ background: "#fbbf24", color: "#000" }}>
          {buying ? "Opening checkout…" : `Unlock for $${((workout.price) / 100).toFixed(2)}`}
        </button>
        <Link href="/ghost" className="text-sm" style={{ color: "#444" }}>← Back to Ghost Workouts</Link>
      </div>
    );
  }

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
    <div className="max-w-xl mx-auto px-4 py-6" style={{ position: "relative" }}>

      {/* Ghost wallpaper */}
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

            {/* Workout video */}
            {workout.videoUrl && (
              <div className="rounded-xl overflow-hidden mb-4" style={{ background: "#000", border: "1px solid rgba(167,139,250,0.2)" }}>
                <video src={workout.videoUrl} controls playsInline
                  className="w-full" style={{ display: "block", maxHeight: 260 }} />
              </div>
            )}

            <div className="flex flex-col gap-2">
              {workout.exercises.map((ex, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-bold w-5 text-center" style={{ color: "#444" }}>{i + 1}</span>
                    <div>
                      <span className="text-sm" style={{ color: "#f2f2f2" }}>{ex.name}</span>
                      {(ex.sets || ex.reps || ex.weightKg) && (
                        <p className="text-[11px] mt-0.5" style={{ color: "#a78bfa" }}>
                          {[ex.sets && ex.reps ? `${ex.sets}×${ex.reps}` : ex.reps ? `${ex.reps} reps` : null, ex.weightKg ? `${ex.weightKg}kg` : null].filter(Boolean).join(" @ ")}
                        </p>
                      )}
                    </div>
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
            style={{ background: phase === "rest" ? "#131313" : "rgba(167,139,250,0.06)", border: `1px solid ${phase === "rest" ? "rgba(255,255,255,0.07)" : "rgba(167,139,250,0.3)"}` }}>
            <p className="text-xs font-bold mb-3 tracking-widest" style={{ color: phase === "rest" ? "#555" : "#a78bfa" }}>
              {phase === "rest" ? "REST" : `EXERCISE ${currentIdx + 1} OF ${workout.exercises.length}`}
            </p>
            <p className="text-xl font-bold mb-1" style={{ color: "#f2f2f2" }}>
              {phase === "rest" ? "Rest" : current?.name}
            </p>
            {/* Weight / reps info */}
            {phase === "active" && (current?.sets || current?.reps || current?.weightKg) && (
              <p className="text-sm font-semibold mb-3" style={{ color: "#a78bfa" }}>
                {[current.sets && current.reps ? `${current.sets} × ${current.reps} reps` : current.reps ? `${current.reps} reps` : null, current.weightKg ? `${current.weightKg} kg` : null].filter(Boolean).join(" @ ")}
              </p>
            )}
            {/* Circular progress ring */}
            <div className="flex items-center justify-center mb-6">
              <div className="relative flex items-center justify-center" style={{ width: 160, height: 160 }}>
                <svg width="160" height="160" style={{ position: "absolute", transform: "rotate(-90deg)" }}>
                  <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                  <circle cx="80" cy="80" r="70" fill="none"
                    stroke={phase === "rest" ? "#444" : "#a78bfa"} strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 70}`}
                    strokeDashoffset={`${2 * Math.PI * 70 * (1 - progress / 100)}`}
                    style={{ transition: "stroke-dashoffset 0.9s linear" }}
                  />
                </svg>
                <span className="tabular-nums font-bold" style={{ fontSize: 52, color: phase === "rest" ? "#555" : "#f2f2f2", lineHeight: 1 }}>{timeLeft}</span>
              </div>
            </div>
            {phase === "rest" && currentIdx + 1 < workout.exercises.length && (
              <p className="text-xs" style={{ color: "#555" }}>
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
        <div className="flex flex-col items-center py-10">
          <div className="w-28 h-28 rounded-full flex items-center justify-center mb-6"
            style={{ background: "linear-gradient(135deg, rgba(167,139,250,0.2), rgba(139,92,246,0.1))", border: "2px solid rgba(167,139,250,0.4)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 52, color: "#a78bfa", fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          </div>
          <h2 className="text-3xl font-bold mb-2" style={{ color: "#f2f2f2" }}>Ghost Complete!</h2>
          <p className="text-sm mb-1" style={{ color: "#666" }}>You finished</p>
          <p className="text-base font-semibold mb-1" style={{ color: "#c4b5fd" }}>{workout.title}</p>
          <p className="text-xs mb-10" style={{ color: "#444" }}>alongside {workout.hostName}&apos;s ghost</p>
          {/* Stats */}
          <div className="flex gap-6 mb-10">
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: "#f2f2f2" }}>{workout.exercises.length}</p>
              <p className="text-xs" style={{ color: "#555" }}>exercises</p>
            </div>
            <div className="w-px" style={{ background: "rgba(255,255,255,0.08)" }} />
            <div className="text-center">
              <p className="text-2xl font-bold" style={{ color: "#f2f2f2" }}>{Math.round(workout.exercises.reduce((s, e) => s + e.durationSecs, 0) / 60)}</p>
              <p className="text-xs" style={{ color: "#555" }}>minutes</p>
            </div>
          </div>
          <div className="flex gap-3 w-full max-w-xs">
            <button onClick={start}
              className="flex-1 py-3 rounded-2xl font-bold text-sm border-none cursor-pointer"
              style={{ background: "rgba(167,139,250,0.12)", color: "#c4b5fd", border: "1px solid rgba(167,139,250,0.25)" }}>
              Do it again
            </button>
            <Link href="/ghost"
              className="flex-1 py-3 rounded-2xl font-bold text-sm flex items-center justify-center"
              style={{ background: "#f2f2f2", color: "#000" }}>
              More Workouts
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

