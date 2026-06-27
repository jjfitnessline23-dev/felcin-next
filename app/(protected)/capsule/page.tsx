"use client";

import { useState, useEffect } from "react";
import {
  collection, query, orderBy, limit, getDocs, addDoc, updateDoc, doc,
  serverTimestamp, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";

interface Capsule {
  id: string;
  authorId: string;
  authorName: string;
  message: string;
  goalType: "workouts" | "days_streak";
  goalValue: number;
  goalExercise?: string;
  createdAt?: { seconds: number };
  unlocked: boolean;
  unlockedAt?: { seconds: number };
}

interface WorkoutLog { id: string; date?: { seconds: number }; }

function computeStreak(logs: WorkoutLog[], nowMs: number): number {
  const days = new Set<number>();
  for (const l of logs) {
    if (!l.date) continue;
    const d = Math.floor(l.date.seconds * 1000 / 86400000);
    days.add(d);
  }
  const today = Math.floor(nowMs / 86400000);
  let streak = 0;
  for (let d = today; days.has(d); d--) streak++;
  return streak;
}

export default function CapsulePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"mine" | "community">("mine");
  const [loading, setLoading] = useState(true);
  const [myCapsules, setMyCapsules] = useState<Capsule[]>([]);
  const [community, setCommunity] = useState<Capsule[]>([]);
  const [myWorkoutCount, setMyWorkoutCount] = useState(0);
  const [myStreak, setMyStreak] = useState(0);
  const [saving, setSaving] = useState(false);

  // Form
  const [message, setMessage] = useState("");
  const [goalType, setGoalType] = useState<"workouts" | "days_streak">("workouts");
  const [goalValue, setGoalValue] = useState("100");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!user) return;
    const nowMs = Date.now();

    async function load() {
      try {
        // Get my workout logs for streak + count
        const logsSnap = await getDocs(
          query(collection(db, "users", user!.uid, "workoutLogs"), orderBy("date", "desc"), limit(100))
        );
        const logs = logsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<WorkoutLog, "id">) }));
        const wCount = logs.length;
        const streak = computeStreak(logs, nowMs);
        setMyWorkoutCount(wCount);
        setMyStreak(streak);

        // My capsules
        const mySnap = await getDocs(
          query(collection(db, "capsules"), where("authorId", "==", user!.uid), orderBy("createdAt", "desc"))
        );
        const caps = mySnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Capsule, "id">) }));

        // Check + unlock
        const updated: Capsule[] = [];
        for (const cap of caps) {
          let goalMet = false;
          if (cap.goalType === "workouts" && wCount >= cap.goalValue) goalMet = true;
          if (cap.goalType === "days_streak" && streak >= cap.goalValue) goalMet = true;

          if (goalMet && !cap.unlocked) {
            try {
              await updateDoc(doc(db, "capsules", cap.id), { unlocked: true, unlockedAt: serverTimestamp() });
              updated.push({ ...cap, unlocked: true });
            } catch {
              updated.push(cap);
            }
          } else {
            updated.push(cap);
          }
        }
        setMyCapsules(updated);

        // Community — unlocked capsules from others
        const commSnap = await getDocs(
          query(collection(db, "capsules"), where("unlocked", "==", true), orderBy("unlockedAt", "desc"), limit(20))
        );
        setCommunity(commSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Capsule, "id">) })));
      } catch {}
      setLoading(false);
    }
    load();
  }, [user]);

  async function handleCreate() {
    if (!user || !message.trim() || saving) return;
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, "capsules"), {
        authorId: user.uid,
        authorName: user.displayName || user.email?.split("@")[0] || "Anonymous",
        message: message.trim(),
        goalType,
        goalValue: Number(goalValue) || 100,
        createdAt: serverTimestamp(),
        unlocked: false,
      });
      setMyCapsules((p) => [{
        id: ref.id, authorId: user.uid,
        authorName: user.displayName || user.email?.split("@")[0] || "Anonymous",
        message: message.trim(), goalType, goalValue: Number(goalValue) || 100,
        unlocked: false,
      }, ...p]);
      setMessage(""); setGoalValue("100"); setShowForm(false);
    } catch {}
    setSaving(false);
  }

  function getProgress(cap: Capsule): { current: number; target: number } {
    if (cap.goalType === "workouts") return { current: myWorkoutCount, target: cap.goalValue };
    if (cap.goalType === "days_streak") return { current: myStreak, target: cap.goalValue };
    return { current: 0, target: cap.goalValue };
  }

  function goalLabel(cap: Capsule): string {
    if (cap.goalType === "workouts") return `${cap.goalValue} workouts logged`;
    if (cap.goalType === "days_streak") return `${cap.goalValue}-day streak`;
    return `Goal: ${cap.goalValue}`;
  }

  return (
    <div className="max-w-xl mx-auto pb-24 overflow-x-hidden">
      <PageHeader title="Time Capsule" />

      {/* Cinematic Hero */}
      <div className="relative mx-4 mt-2 mb-4 rounded-3xl overflow-hidden"
        style={{ background: "linear-gradient(135deg,#03060f 0%,#060d1c 50%,#03060f 100%)", border: "1px solid rgba(129,140,248,0.22)", minHeight: 160 }}>
        <div className="absolute left-0 w-full pointer-events-none" style={{ height: 1.5, background: "linear-gradient(90deg,transparent,rgba(129,140,248,0.4),transparent)", animation: "scanLine 5s linear infinite", zIndex: 1 }} />
        <div className="absolute pointer-events-none" style={{ top: "-30%", left: "50%", transform: "translateX(-50%)", width: 420, height: 420, background: "radial-gradient(ellipse at center,rgba(99,102,241,0.28) 0%,rgba(6,182,212,0.1) 40%,transparent 65%)", animation: "heroGlow 4s ease-in-out infinite" }} />
        <div className="absolute inset-0 flex items-center justify-end pr-4 pointer-events-none select-none">
          <img src="/static/logo-nav.svg" alt="" style={{ width: 160, opacity: 0.05, filter: "grayscale(1) brightness(3) sepia(1) hue-rotate(200deg)", animation: "floatLogo 8s ease-in-out infinite" }} />
        </div>
        <div className="relative z-10 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(129,140,248,0.2)", border: "1px solid rgba(129,140,248,0.4)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#818cf8", fontVariationSettings: "'FILL' 1" }}>lock_clock</span>
            </div>
            <span className="text-xs font-black tracking-widest" style={{ color: "#818cf8", letterSpacing: "0.18em" }}>TIME CAPSULE</span>
          </div>
          <h1 className="font-black mb-1" style={{ fontSize: "clamp(1.6rem,6vw,2.2rem)", letterSpacing: -1, background: "linear-gradient(135deg,#fff 0%,#a5b4fc 55%,#67e8f9 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Time Capsule</h1>
          <p className="text-sm" style={{ color: "#555" }}>Seal messages to your future self — unlock them when you hit milestones</p>
          {!loading && (
            <div className="flex items-center gap-4 mt-3">
              <div><span className="text-base font-black" style={{ color: "#818cf8" }}>{myCapsules.length}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>my capsules</span></div>
              <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.07)" }} />
              <div><span className="text-base font-black" style={{ color: "#818cf8" }}>{myCapsules.filter(c => c.unlocked).length}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>unlocked</span></div>
              <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.07)" }} />
              <div><span className="text-base font-black" style={{ color: "#818cf8" }}>{myWorkoutCount}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>workouts</span></div>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-3">
        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {(["mine", "community"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-1.5 rounded-full text-sm font-semibold border-none cursor-pointer"
              style={{ background: tab === t ? "#f2f2f2" : "rgba(255,255,255,0.07)", color: tab === t ? "#000" : "#666" }}>
              {t === "mine" ? "My Capsules" : "Community"}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><div className="spinner" /></div>
        ) : (
          <>
            {/* MY CAPSULES */}
            {tab === "mine" && (
              <>
                {/* Create button */}
                <button
                  onClick={() => setShowForm(!showForm)}
                  className="w-full py-3 rounded-xl text-sm font-bold border-none cursor-pointer mb-4 flex items-center justify-center gap-2"
                  style={{ background: showForm ? "rgba(255,255,255,0.06)" : "#f2f2f2", color: showForm ? "#888" : "#000" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{showForm ? "close" : "add"}</span>
                  {showForm ? "Cancel" : "Create New Capsule"}
                </button>

                {/* Create form */}
                {showForm && (
                  <div className="rounded-2xl p-4 mb-4" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <p className="text-[10px] font-bold tracking-widest mb-3" style={{ color: "#444" }}>NEW TIME CAPSULE</p>

                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Write a message to your future self…"
                      rows={4}
                      className="w-full px-3 py-2.5 rounded-xl outline-none text-sm resize-none mb-3"
                      style={{ background: "#222", border: "1px solid rgba(255,255,255,0.06)", color: "#f2f2f2" }}
                    />

                    <p className="text-xs mb-2" style={{ color: "#555" }}>Unlock when I reach:</p>
                    <div className="flex gap-2 mb-3">
                      {(["workouts", "days_streak"] as const).map((t) => (
                        <button key={t} onClick={() => setGoalType(t)}
                          className="flex-1 py-2 rounded-xl text-xs font-semibold border-none cursor-pointer"
                          style={{ background: goalType === t ? "rgba(167,139,250,0.2)" : "rgba(255,255,255,0.05)", color: goalType === t ? "#a78bfa" : "#555", border: `1px solid ${goalType === t ? "rgba(167,139,250,0.3)" : "transparent"}` }}>
                          {t === "workouts" ? "Workout Count" : "Day Streak"}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-3 mb-4">
                      <input
                        type="number"
                        value={goalValue}
                        onChange={(e) => setGoalValue(e.target.value)}
                        min="1"
                        className="flex-1 px-3 py-2 rounded-xl outline-none text-sm text-center"
                        style={{ background: "#222", border: "1px solid rgba(255,255,255,0.06)", color: "#f2f2f2" }}
                      />
                      <span className="text-sm" style={{ color: "#666" }}>
                        {goalType === "workouts" ? "workouts" : "days in a row"}
                      </span>
                    </div>

                    <button
                      onClick={handleCreate}
                      disabled={saving || !message.trim()}
                      className="w-full py-3 rounded-xl text-sm font-bold border-none cursor-pointer"
                      style={{ background: saving || !message.trim() ? "#222" : "#a78bfa", color: saving || !message.trim() ? "#444" : "#fff" }}>
                      {saving ? "Sealing…" : "🔒 Seal Capsule"}
                    </button>
                  </div>
                )}

                {/* My capsule list */}
                {myCapsules.length === 0 ? (
                  <div className="flex flex-col items-center py-12 gap-3" style={{ color: "#555" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 48 }}>lock_clock</span>
                    <p className="text-sm">No capsules yet. Write your first message to the future.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {myCapsules.map((cap) => {
                      const prog = getProgress(cap);
                      const pct = Math.min(100, Math.round((prog.current / prog.target) * 100));
                      return (
                        <div key={cap.id} className="p-4 rounded-2xl" style={{ background: "#131313", border: `1px solid ${cap.unlocked ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.07)"}` }}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">{cap.unlocked ? "🎉" : "🔒"}</span>
                            <span className="text-sm font-bold" style={{ color: cap.unlocked ? "#22c55e" : "#f2f2f2" }}>
                              {cap.unlocked ? "Unlocked!" : "Locked"}
                            </span>
                            <span className="ml-auto text-xs" style={{ color: "#444" }}>{goalLabel(cap)}</span>
                          </div>

                          {cap.unlocked ? (
                            <p className="text-sm leading-relaxed" style={{ color: "#f2f2f2" }}>{cap.message}</p>
                          ) : (
                            <>
                              <p className="text-sm tracking-wider mb-3" style={{ color: "#333" }}>{"● ".repeat(Math.min(20, cap.message.length / 3 | 0))}</p>
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px]" style={{ color: "#555" }}>
                                    {prog.current} / {prog.target} {cap.goalType === "workouts" ? "workouts" : "day streak"}
                                  </span>
                                  <span className="text-[10px] font-bold" style={{ color: "#a78bfa" }}>{pct}%</span>
                                </div>
                                <div className="w-full rounded-full overflow-hidden" style={{ height: 6, background: "#1f1f1f" }}>
                                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#a78bfa" }} />
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* COMMUNITY */}
            {tab === "community" && (
              <>
                {community.length === 0 ? (
                  <div className="flex flex-col items-center py-12 gap-3" style={{ color: "#555" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 48 }}>people</span>
                    <p className="text-sm">No unlocked capsules yet — be the first!</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {community.map((cap) => (
                      <div key={cap.id} className="p-4 rounded-2xl" style={{ background: "#131313", border: "1px solid rgba(34,197,94,0.15)" }}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm">🎉</span>
                          <span className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>{cap.authorName}</span>
                          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>
                            {goalLabel(cap)}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed" style={{ color: "#888" }}>
                          {cap.message.length > 120 ? cap.message.slice(0, 120) + "…" : cap.message}
                        </p>
                        {cap.unlockedAt && (
                          <p className="text-[10px] mt-2" style={{ color: "#444" }}>
                            Unlocked {new Date(cap.unlockedAt.seconds * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
