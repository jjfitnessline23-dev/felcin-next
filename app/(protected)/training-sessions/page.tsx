"use client";

import { useState, useEffect } from "react";
import { collection, query, where, getDocs, or } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";

interface TrainingSession {
  id: string;
  trainerId: string;
  traineeId: string;
  traineeName?: string;
  trainerName?: string;
  trainerPhoto?: string;
  traineePhoto?: string;
  sessionDate: string;
  status: "pending" | "accepted" | "declined" | "completed";
  price?: number;
  exercises?: unknown[];
  stripeSessionId?: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  accepted: "#22c55e",
  declined: "#ef4444",
  completed: "#6d28d9",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Awaiting Confirmation",
  accepted: "Confirmed",
  declined: "Declined",
  completed: "Completed",
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  } catch { return iso; }
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  } catch { return ""; }
}

export default function TrainingSessionsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  /* Handle return from Stripe checkout */
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState("");

  useEffect(() => {
    const stripeSessionId = searchParams.get("session_id");
    const trainerId = searchParams.get("trainer");
    const date = searchParams.get("date");
    if (!stripeSessionId || !user || !trainerId || !date) return;

    setVerifying(true);
    user.getIdToken().then(async (token) => {
      const res = await fetch("/api/training-session-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stripeSessionId, token }),
      });
      const data = await res.json();
      if (data.ok) {
        setVerifyMsg("Session booked! Your trainer will confirm shortly.");
        router.replace("/training-sessions");
      } else {
        setVerifyMsg(data.error || "Verification failed");
      }
      setVerifying(false);
    }).catch(() => { setVerifyMsg("Verification failed"); setVerifying(false); });
  }, [user]); // eslint-disable-line

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    // Fetch sessions where user is either trainer or trainee
    Promise.all([
      getDocs(query(collection(db, "trainingSessions"), where("traineeId", "==", user.uid))),
      getDocs(query(collection(db, "trainingSessions"), where("trainerId", "==", user.uid))),
    ]).then(([traineeSnap, trainerSnap]) => {
      const seen = new Set<string>();
      const all: TrainingSession[] = [];
      for (const snap of [traineeSnap, trainerSnap]) {
        for (const d of snap.docs) {
          if (!seen.has(d.id)) { seen.add(d.id); all.push({ id: d.id, ...(d.data() as Omit<TrainingSession, "id">) }); }
        }
      }
      all.sort((a, b) => new Date(b.sessionDate).getTime() - new Date(a.sessionDate).getTime());
      setSessions(all);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  const now = new Date();
  const upcoming = sessions.filter((s) => s.status !== "declined" && new Date(s.sessionDate) >= now);
  const past = sessions.filter((s) => s.status === "completed" || (s.status !== "declined" && new Date(s.sessionDate) < now));
  const visible = tab === "upcoming" ? upcoming : past;

  return (
    <div className="max-w-xl mx-auto" style={{ paddingBottom: 96 }}>
      <PageHeader title="My Sessions" />

      {/* Cinematic Hero */}
      <div className="relative mx-4 mt-2 mb-4 rounded-3xl overflow-hidden"
        style={{ background: "linear-gradient(135deg,#011208 0%,#031a0c 50%,#011208 100%)", border: "1px solid rgba(34,197,94,0.2)", minHeight: 160 }}>
        <div className="absolute left-0 w-full pointer-events-none" style={{ height: 1.5, background: "linear-gradient(90deg,transparent,rgba(34,197,94,0.35),transparent)", animation: "scanLine 5s linear infinite", zIndex: 1 }} />
        <div className="absolute pointer-events-none" style={{ top: "-30%", left: "50%", transform: "translateX(-50%)", width: 400, height: 400, background: "radial-gradient(ellipse at center,rgba(34,197,94,0.25) 0%,transparent 65%)", animation: "heroGlow 4s ease-in-out infinite" }} />
        <div className="absolute inset-0 flex items-center justify-end pr-4 pointer-events-none select-none">
          <img src="/static/logo-nav.svg" alt="" style={{ width: 160, opacity: 0.05, filter: "grayscale(1) brightness(3) sepia(1) hue-rotate(90deg)", animation: "floatLogo 8s ease-in-out infinite" }} />
        </div>
        <div className="relative z-10 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "rgba(34,197,94,0.2)", border: "1px solid rgba(34,197,94,0.4)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: "#22c55e", fontVariationSettings: "'FILL' 1" }}>event_available</span>
            </div>
            <span className="text-xs font-black tracking-widest" style={{ color: "#22c55e", letterSpacing: "0.18em" }}>MY SESSIONS</span>
          </div>
          <h1 className="font-black mb-1" style={{ fontSize: "clamp(1.6rem,6vw,2.2rem)", letterSpacing: -1, background: "linear-gradient(135deg,#fff 0%,#86efac 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Training Sessions</h1>
          <p className="text-sm" style={{ color: "#555" }}>Your bookings with personal trainers</p>
          <div className="flex items-center gap-4 mt-3">
            <div><span className="text-base font-black" style={{ color: "#22c55e" }}>{upcoming.length}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>upcoming</span></div>
            <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.07)" }} />
            <div><span className="text-base font-black" style={{ color: "#22c55e" }}>{past.length}</span><span className="text-xs ml-1.5" style={{ color: "#555" }}>completed</span></div>
          </div>
        </div>
      </div>

      {verifying && (
        <div className="mx-4 mt-3 p-3 rounded-xl flex items-center gap-2" style={{ background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)" }}>
          <div className="spinner" style={{ width: 16, height: 16 }} />
          <span className="text-sm" style={{ color: "#a78bfa" }}>Confirming your booking…</span>
        </div>
      )}
      {verifyMsg && !verifying && (
        <div className="mx-4 mt-3 p-3 rounded-xl" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
          <span className="text-sm" style={{ color: "#22c55e" }}>{verifyMsg}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex mx-4 mt-4 mb-4 p-1 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)" }}>
        {(["upcoming", "past"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2.5 rounded-xl text-xs font-bold border-none cursor-pointer capitalize"
            style={{ background: tab === t ? "#f2f2f2" : "transparent", color: tab === t ? "#000" : "#555" }}>
            {t === "upcoming" ? `Upcoming${upcoming.length > 0 ? ` (${upcoming.length})` : ""}` : "Past"}
          </button>
        ))}
      </div>

      <div className="px-4 flex flex-col gap-3">
        {loading ? (
          <div className="flex justify-center py-16"><div className="spinner" /></div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: "#333" }}>fitness_center</span>
            <p className="text-sm" style={{ color: "#555" }}>
              {tab === "upcoming" ? "No upcoming sessions" : "No past sessions"}
            </p>
            {tab === "upcoming" && (
              <button onClick={() => router.push("/trainers")}
                className="px-4 py-2 rounded-xl text-sm font-semibold border-none cursor-pointer mt-2"
                style={{ background: "rgba(167,139,250,0.12)", color: "#a78bfa" }}>
                Find a Trainer
              </button>
            )}
          </div>
        ) : visible.map((s) => {
          const isTrainer = s.trainerId === user?.uid;
          const otherName = isTrainer ? (s.traineeName || "Client") : (s.trainerName || "Trainer");
          const otherPhoto = isTrainer ? s.traineePhoto : s.trainerPhoto;
          const hasLog = (s.exercises || []).length > 0;

          return (
            <button key={s.id} onClick={() => router.push(`/training-sessions/${s.id}`)}
              className="w-full text-left p-4 rounded-2xl border-none cursor-pointer"
              style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center gap-3 mb-3">
                {otherPhoto ? (
                  <img src={otherPhoto} alt="" className="rounded-full object-cover shrink-0" style={{ width: 44, height: 44 }} />
                ) : (
                  <div className="rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{ width: 44, height: 44, background: "#222", color: "#888" }}>
                    {otherName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold" style={{ color: "#f2f2f2" }}>{otherName}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#666" }}>
                    {isTrainer ? "Client" : "Trainer"}
                  </p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: `${STATUS_COLORS[s.status]}18`, color: STATUS_COLORS[s.status] }}>
                  {STATUS_LABELS[s.status]}
                </span>
              </div>

              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#555" }}>calendar_today</span>
                <span className="text-xs" style={{ color: "#888" }}>{fmtDate(s.sessionDate)}</span>
                <span className="text-xs" style={{ color: "#555" }}>·</span>
                <span className="text-xs" style={{ color: "#888" }}>{fmtTime(s.sessionDate)}</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: hasLog ? "#22c55e" : "#444" }}>fitness_center</span>
                <span className="text-xs" style={{ color: hasLog ? "#22c55e" : "#555" }}>
                  {hasLog ? `${(s.exercises || []).length} exercises planned` : "Workout log not built yet"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
