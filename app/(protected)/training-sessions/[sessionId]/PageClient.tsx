"use client";

import { useState, useEffect } from "react";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";

interface PlannedSet { reps: number; weight: number; }
interface PlannedExercise { name: string; sets: PlannedSet[]; equipment?: string; }

interface TrainingSession {
  trainerId: string;
  traineeId: string;
  traineeName?: string;
  trainerName?: string;
  trainerPhoto?: string;
  traineePhoto?: string;
  sessionDate: string;
  status: "pending" | "accepted" | "declined" | "completed";
  exercises: PlannedExercise[];
  notes?: string;
  price?: number;
  doneSets?: Record<string, boolean>;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  accepted: "#22c55e",
  declined: "#ef4444",
  completed: "#a78bfa",
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  } catch { return iso; }
}
function fmtTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); }
  catch { return ""; }
}

export default function SessionDetailClient() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [session, setSession] = useState<TrainingSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [doneSets, setDoneSets] = useState<Record<string, boolean>>({});
  const [markingComplete, setMarkingComplete] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [timerActive, setTimerActive] = useState(false);

  useEffect(() => {
    if (!sessionId || sessionId === "_") return;
    const unsub = onSnapshot(doc(db, "trainingSessions", sessionId), (snap) => {
      if (!snap.exists()) { setNotFound(true); setLoading(false); return; }
      const data = snap.data() as TrainingSession;
      setSession(data);
      setDoneSets(data.doneSets || {});
      setLoading(false);
    }, () => { setNotFound(true); setLoading(false); });
    return () => unsub();
  }, [sessionId]);

  // Live timer during session
  useEffect(() => {
    if (!timerActive) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [timerActive]);

  const fmtTimer = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
  };

  const toggleSet = async (key: string) => {
    if (!session || !user || user.uid !== session.traineeId) return;
    const next = { ...doneSets, [key]: !doneSets[key] };
    setDoneSets(next);
    await updateDoc(doc(db, "trainingSessions", sessionId), { doneSets: next }).catch(() => {});
  };

  const markComplete = async () => {
    if (!session || !user || user.uid !== session.trainerId || markingComplete) return;
    setMarkingComplete(true);
    await updateDoc(doc(db, "trainingSessions", sessionId), { status: "completed" }).catch(() => {});
    setMarkingComplete(false);
  };

  const isTrainer = user?.uid === session?.trainerId;
  const isTrainee = user?.uid === session?.traineeId;
  const canAccess = isTrainer || isTrainee;

  const totalSets = (session?.exercises || []).reduce((t, ex) => t + ex.sets.length, 0);
  const completedSets = Object.values(doneSets).filter(Boolean).length;
  const progress = totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0;

  if (loading) return (
    <div className="max-w-xl mx-auto" style={{ paddingBottom: 96 }}>
      <PageHeader title="Session" />
      <div className="flex justify-center py-20"><div className="spinner" /></div>
    </div>
  );

  if (notFound || !session) return (
    <div className="max-w-xl mx-auto" style={{ paddingBottom: 96 }}>
      <PageHeader title="Session" />
      <p className="text-center py-20 text-sm" style={{ color: "#555" }}>Session not found</p>
    </div>
  );

  if (!canAccess) return (
    <div className="max-w-xl mx-auto" style={{ paddingBottom: 96 }}>
      <PageHeader title="Session" />
      <p className="text-center py-20 text-sm" style={{ color: "#555" }}>You don&apos;t have access to this session</p>
    </div>
  );

  return (
    <div className="max-w-xl mx-auto" style={{ paddingBottom: 96 }}>
      <PageHeader title="Training Session" />

      {/* Session info card */}
      <div className="mx-4 mt-4 p-4 rounded-2xl" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-base font-bold" style={{ color: "#f2f2f2" }}>
              {isTrainer ? (session.traineeName || "Client") : (session.trainerName || "Trainer")}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#555" }}>{isTrainer ? "Your client" : "Your trainer"}</p>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full capitalize"
            style={{ background: `${STATUS_COLORS[session.status]}18`, color: STATUS_COLORS[session.status] }}>
            {session.status}
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs" style={{ color: "#666" }}>
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>calendar_today</span>
            {fmtDate(session.sessionDate)}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>schedule</span>
            {fmtTime(session.sessionDate)}
          </div>
        </div>
      </div>

      {/* Timer (trainee only, during session) */}
      {isTrainee && session.status === "accepted" && (
        <div className="mx-4 mt-3 flex items-center gap-3 p-3 rounded-2xl" style={{ background: timerActive ? "rgba(34,197,94,0.07)" : "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: timerActive ? "#22c55e" : "#444" }}>timer</span>
          <span className="text-xl font-bold tabular-nums flex-1" style={{ color: timerActive ? "#22c55e" : "#555" }}>
            {fmtTimer(elapsed)}
          </span>
          <button onClick={() => setTimerActive((v) => !v)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold border-none cursor-pointer"
            style={{ background: timerActive ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)", color: timerActive ? "#f87171" : "#22c55e" }}>
            {timerActive ? "Pause" : elapsed > 0 ? "Resume" : "Start Session"}
          </button>
          {elapsed > 0 && (
            <button onClick={() => { setElapsed(0); setTimerActive(false); }}
              className="px-2 py-1.5 rounded-xl text-xs border-none bg-transparent cursor-pointer" style={{ color: "#444" }}>
              Reset
            </button>
          )}
        </div>
      )}

      {/* Progress bar (if has log and trainee is tracking) */}
      {totalSets > 0 && isTrainee && (
        <div className="mx-4 mt-3 p-3 rounded-2xl" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold" style={{ color: "#888" }}>Workout Progress</span>
            <span className="text-xs font-bold" style={{ color: progress === 100 ? "#22c55e" : "#f2f2f2" }}>{progress}%</span>
          </div>
          <div className="rounded-full overflow-hidden" style={{ height: 6, background: "rgba(255,255,255,0.06)" }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, background: progress === 100 ? "#22c55e" : "#a78bfa" }} />
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: "#444" }}>{completedSets} of {totalSets} sets done</p>
        </div>
      )}

      {/* Workout log */}
      <div className="mx-4 mt-4">
        <p className="text-[10px] font-bold tracking-widest mb-3" style={{ color: "#444" }}>WORKOUT LOG</p>

        {session.exercises?.length > 0 ? (
          <div className="flex flex-col gap-3">
            {session.exercises.map((ex, ei) => (
              <div key={ei} className="rounded-2xl overflow-hidden" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <div>
                    <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>{ex.name}</p>
                    {ex.equipment && <p className="text-[10px] mt-0.5" style={{ color: "#a78bfa" }}>{ex.equipment}</p>}
                  </div>
                  <span className="text-xs" style={{ color: "#555" }}>{ex.sets.length} sets</span>
                </div>

                <div className="px-4 py-3">
                  <div className="flex text-[10px] font-bold mb-2 gap-2" style={{ color: "#444" }}>
                    <span style={{ width: 20 }}>#</span>
                    <span className="flex-1 text-center">Target Reps</span>
                    <span className="flex-1 text-center">Weight (kg)</span>
                    {isTrainee && <span style={{ width: 28 }} />}
                  </div>
                  {ex.sets.map((set, si) => {
                    const key = `${ei}_${si}`;
                    const done = doneSets[key] === true;
                    return (
                      <div key={si} className="flex items-center gap-2 mb-1.5 transition-opacity"
                        style={{ opacity: done ? 0.45 : 1 }}>
                        <span className="text-xs text-center tabular-nums" style={{ width: 20, color: "#555" }}>{si + 1}</span>
                        <div className="flex-1 px-2 py-1.5 rounded-lg text-sm text-center"
                          style={{ background: "rgba(255,255,255,0.04)", color: "#f2f2f2" }}>
                          {set.reps}
                        </div>
                        <div className="flex-1 px-2 py-1.5 rounded-lg text-sm text-center"
                          style={{ background: "rgba(255,255,255,0.04)", color: "#f2f2f2" }}>
                          {set.weight > 0 ? set.weight : "—"}
                        </div>
                        {isTrainee && (
                          <button onClick={() => toggleSet(key)}
                            className="border-none cursor-pointer rounded-lg flex items-center justify-center transition-all"
                            style={{ width: 28, height: 28, background: done ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)" }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16, color: done ? "#22c55e" : "#333", fontVariationSettings: done ? "'FILL' 1" : "'FILL' 0" }}>
                              check_circle
                            </span>
                          </button>
                        )}
                        {isTrainer && done && (
                          <span className="material-symbols-outlined shrink-0" style={{ fontSize: 16, color: "#22c55e", width: 28, fontVariationSettings: "'FILL' 1" }}>
                            check_circle
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center py-10 gap-3 rounded-2xl" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 40, color: "#333" }}>fitness_center</span>
            <p className="text-sm" style={{ color: "#555" }}>
              {isTrainer ? "Tap Build Log on the Sessions tab to add exercises" : "Your trainer hasn't built the workout log yet"}
            </p>
            {isTrainer && (
              <button onClick={() => router.push("/trainer-dashboard")}
                className="px-4 py-2 rounded-xl text-sm font-semibold border-none cursor-pointer mt-1"
                style={{ background: "rgba(167,139,250,0.12)", color: "#a78bfa" }}>
                Go to Dashboard
              </button>
            )}
          </div>
        )}
      </div>

      {/* Trainer notes */}
      {session.notes && (
        <div className="mx-4 mt-4 p-4 rounded-2xl" style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.15)" }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#a78bfa" }}>sticky_note_2</span>
            <p className="text-[10px] font-bold tracking-widest" style={{ color: "#a78bfa" }}>TRAINER NOTES</p>
          </div>
          <p className="text-sm" style={{ color: "#c4b5fd", lineHeight: 1.6 }}>{session.notes}</p>
        </div>
      )}

      {/* Trainer: mark complete */}
      {isTrainer && session.status === "accepted" && (
        <div className="mx-4 mt-4">
          <button onClick={markComplete} disabled={markingComplete}
            className="w-full py-3.5 rounded-xl text-sm font-bold border-none cursor-pointer"
            style={{ background: markingComplete ? "#2a2a2a" : "rgba(167,139,250,0.12)", color: markingComplete ? "#555" : "#a78bfa", border: "1px solid rgba(167,139,250,0.2)" }}>
            {markingComplete ? "Marking…" : "Mark Session Complete"}
          </button>
        </div>
      )}

      {/* Message button */}
      <div className="mx-4 mt-3">
        <button onClick={() => router.push(`/private-chats?uid=${isTrainer ? session.traineeId : session.trainerId}`)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold border-none cursor-pointer"
          style={{ background: "rgba(255,255,255,0.05)", color: "#777" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 17 }}>chat</span>
          Message {isTrainer ? "Client" : "Trainer"}
        </button>
      </div>
    </div>
  );
}
